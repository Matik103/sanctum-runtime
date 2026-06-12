import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, PauseCircle, PlayCircle } from 'lucide-react'
import { getFleetStatus, fleetPause, fleetResume, type FleetPauseStatus } from '../lib/api'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { timeAgo } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import { TabBar } from '../components/ui/TabBar'
import {
  createDeploymentGroup,
  dispatchFleetCommand,
  fetchDeploymentGroups,
  fetchFleetAgents,
  fetchFleetEvents,
  fetchFleetMap,
  fetchMyOrgs,
  fetchRuntimes,
  updateRuntimePlacement,
  type DeploymentGroup,
  type FleetAgent,
  type FleetEvent,
  type FleetMap,
  type FleetOrg,
  type FleetRuntime,
} from '../lib/fleet'
import { fetchOperatorContext } from '../lib/marketplace'
import { fetchConnectAgents, pauseConnectAgent, resumeConnectAgent, type ConnectAgentRegistration } from '../lib/agents-api'
import { canUseAdvancedFleet } from '../lib/billing'
import { useWorkspacePlan } from '../hooks/useWorkspacePlan'
import { formatApiError, looksLikeUpgradeMessage } from '../lib/sanitize-error'

function statusBadge(status: string) {
  if (status === 'online') return 'success'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

function trustBadge(status: FleetRuntime['attestation_status']) {
  if (status === 'verified') return { label: 'Verified', className: 'success' as const }
  if (status === 'limited') return { label: 'Limited trust', className: 'warning' as const }
  return { label: 'Unverified', className: 'neutral' as const }
}

import type { PageId } from '../layout/Sidebar'

export function Fleet({ onPage }: { onPage?: (p: PageId) => void } = {}) {
  const { planId } = useWorkspacePlan()
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const advancedFleet = canUseAdvancedFleet(planId)
  const [runtimes, setRuntimes] = useState<FleetRuntime[]>([])
  const [agents, setAgents] = useState<FleetAgent[]>([])
  const [connectAgents, setConnectAgents] = useState<ConnectAgentRegistration[]>([])
  const [events, setEvents] = useState<FleetEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'runtimes' | 'map' | 'agents' | 'events'>('map')
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [fleetMap, setFleetMap] = useState<FleetMap | null>(null)
  const [dispatchCmd, setDispatchCmd] = useState('ping')
  const [dispatchRegion, setDispatchRegion] = useState('')
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null)
  const [dispatchGroupId, setDispatchGroupId] = useState('')
  const [groups, setGroups] = useState<DeploymentGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupRegion, setNewGroupRegion] = useState('')
  const [groupMsg, setGroupMsg] = useState<string | null>(null)
  const [pauseStatus, setPauseStatus] = useState<FleetPauseStatus | null>(null)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [agentPauseLoading, setAgentPauseLoading] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      let list = await fetchMyOrgs()
      if (list.length === 0) {
        const ctx = await fetchOperatorContext()
        if (ctx?.defaultOrganizationId) {
          list = [{ org_id: ctx.defaultOrganizationId, org_name: 'Workspace', role: 'owner' }]
        }
      }
      setOrgs(list)
      if (list.length >= 1) setOrgId(list[0].org_id)
    })()
  }, [])

  useEffect(() => {
    if (!orgId) return
    getFleetStatus(orgId).then(setPauseStatus).catch(() => {})
  }, [orgId])

  const togglePause = async () => {
    if (!orgId || pauseLoading) return
    setPauseLoading(true)
    try {
      const result = pauseStatus?.paused ? await fleetResume(orgId) : await fleetPause(orgId)
      setPauseStatus(result)
    } catch { /* best-effort */ } finally {
      setPauseLoading(false)
    }
  }

  const refresh = useCallback(async () => {
    const filter = orgId || undefined
    const mapOrg = filter ?? orgs[0]?.org_id
    let mapError: string | null = null

    try {
      const [rt, ev, ag] = await Promise.all([
        fetchRuntimes(filter),
        fetchFleetEvents(80, filter),
        fetchFleetAgents(filter),
      ])
      setRuntimes(rt)
      setEvents(ev)
      setAgents(ag)
      if (filter) {
        const ca = await fetchConnectAgents(filter).catch(() => [])
        setConnectAgents(ca)
      } else {
        setConnectAgents([])
      }
    } catch (e) {
      setError(formatApiError(e, 'Fleet data unavailable'))
      return
    }

    if (mapOrg) {
      try {
        const [map, gr] = await Promise.all([
          fetchFleetMap(mapOrg),
          fetchDeploymentGroups(mapOrg),
        ])
        setFleetMap(map)
        setGroups(gr)
      } catch (e) {
        mapError = formatApiError(e, 'Fleet map unavailable')
        setFleetMap(null)
        setGroups([])
      }
    } else if (orgs.length > 0) {
      setFleetMap(null)
      try {
        const all = await Promise.all(orgs.map((o) => fetchDeploymentGroups(o.org_id)))
        setGroups(all.flat())
      } catch {
        setGroups([])
      }
    } else {
      setFleetMap(null)
      setGroups([])
    }

    setError(mapError)
  }, [orgId, orgs])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 15_000)
    return () => clearInterval(id)
  }, [refresh])

  const mapOrgId = orgId || orgs[0]?.org_id || ''

  const tabs = [
    { id: 'runtimes' as const, label: 'Runtimes', count: runtimes.length },
    { id: 'map' as const, label: 'Map', count: fleetMap?.regions.length ?? 0 },
    { id: 'agents' as const, label: 'Agents', count: agents.length + connectAgents.length },
    { id: 'events' as const, label: 'Events', count: events.length },
  ]

  async function toggleAgentPause(agent: ConnectAgentRegistration) {
    if (!orgId || agentPauseLoading) return
    setAgentPauseLoading(agent.id)
    try {
      if (agent.actions_paused) {
        await resumeConnectAgent(orgId, agent.id)
      } else {
        await pauseConnectAgent(orgId, agent.id)
      }
      void refresh()
    } catch {
      /* best-effort */
    } finally {
      setAgentPauseLoading(null)
    }
  }

  async function handleCreateGroup() {
    if (!mapOrgId || !newGroupName.trim()) {
      setGroupMsg('Organization and group name required')
      return
    }
    try {
      await createDeploymentGroup({
        organizationId: mapOrgId,
        name: newGroupName.trim(),
        region: newGroupRegion.trim() || undefined,
      })
      setNewGroupName('')
      setNewGroupRegion('')
      setGroupMsg('Group created')
      void refresh()
    } catch (e) {
      setGroupMsg(formatApiError(e, 'Create failed'))
    }
  }

  async function assignRuntimeGroup(runtimeId: string, deploymentGroupId: string) {
    try {
      await updateRuntimePlacement(runtimeId, {
        deploymentGroupId: deploymentGroupId || null,
      })
      void refresh()
    } catch (e) {
      setError(formatApiError(e, 'Could not assign group'))
    }
  }

  async function handleDispatch() {
    if (!mapOrgId) {
      setDispatchMsg('Select an organization first')
      return
    }
    const cmd = dispatchCmd.trim()
    if (!cmd) {
      setDispatchMsg('Enter a command first')
      return
    }
    const ok = await confirm({
      title: 'Dispatch fleet command?',
      message: `Send "${cmd}" to all matching runtimes in this organization.`,
      confirmLabel: 'Dispatch',
      variant: 'warn',
      impact: [
        `Organization: ${mapOrgId}`,
        dispatchRegion.trim() ? `Region filter: ${dispatchRegion.trim()}` : 'All regions',
        'Agents on matched runtimes will receive this command',
      ],
    })
    if (!ok) return
    try {
      const res = await dispatchFleetCommand({
        organizationId: mapOrgId,
        command: dispatchCmd.trim(),
        payload: { source: 'dashboard' },
        region: dispatchRegion.trim() || undefined,
        deploymentGroupId: dispatchGroupId || undefined,
      })
      const viaWs =
        res.wsDelivered != null && res.wsDelivered > 0
          ? ` (${res.wsDelivered} via WebSocket)`
          : ''
      setDispatchMsg(`Dispatched to ${res.targetCount} runtime(s)${viaWs}`)
    } catch (e) {
      setDispatchMsg(formatApiError(e, 'Dispatch failed'))
    }
  }

  return (
    <>
      <ConfirmDialog />
      <header className="page-header">
        <div>
          <h1>Runtime Fleet</h1>
          <p>Registered runtimes, active agents, and orchestration</p>
        </div>
        <PageActions>
          {orgs.length > 0 && (
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organization"
              style={{ minWidth: '10rem' }}
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          )}
          {orgId && (
            <button
              type="button"
              className={`btn btn-sm ${pauseStatus?.paused ? 'btn-primary' : 'btn-danger'}`}
              onClick={() => void togglePause()}
              disabled={pauseLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              {pauseStatus?.paused
                ? <><PlayCircle size={14} /> Resume Fleet</>
                : <><PauseCircle size={14} /> Pause Fleet</>
              }
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
            <RefreshCw size={15} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
            Refresh
          </button>
        </PageActions>
      </header>

      {pauseStatus?.paused && (
        <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
          <div className="alert__body">
            <strong>Fleet paused</strong> — all agent action approvals are blocked org-wide. Agents will receive BLOCKED responses until resumed.
            {pauseStatus.pausedBy && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.82rem', opacity: 0.8 }}>
                Paused by {pauseStatus.pausedBy}
                {pauseStatus.pausedAt && ` · ${new Date(pauseStatus.pausedAt).toLocaleString()}`}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <PlanGateAlert message={error} onDismiss={() => setError(null)} />
      )}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'runtimes' && (
        <>
          {runtimes.length === 0 ? (
            <div className="section__body">
            <EmptyState
              title="No SDK runtimes connected"
              description={
                orgId
                  ? 'Connect-only agents appear under the Agents tab. Register an SDK runtime via Devices, or use Connect Agent for a zero-SDK proxy path.'
                  : 'Connect a runtime using your organization credentials. See Devices for API keys, or Connect Agent for proxy-based agents.'
              }
            />
            </div>
          ) : (
            <div className="policy-grid">
              {runtimes.map((r) => (
                <article key={r.id} className="policy-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{r.name}</h3>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {r.attestation_report?.hardwareVerified === true && (
                        <span className="badge success">HW</span>
                      )}
                      {(() => {
                        const t = trustBadge(r.attestation_status ?? 'unverified')
                        return <span className={`badge ${t.className}`}>{t.label}</span>
                      })()}
                      <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                    </div>
                  </div>
                  <p className="hint-line" style={{ margin: '0.3rem 0 0' }}>
                    {r.mode}{r.region ? ` · ${r.region}` : ''} · trust {r.trust_score}
                  </p>
                  {r.active_model && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {r.active_model}
                    </p>
                  )}
                  {r.current_task && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                      {r.current_task}
                    </p>
                  )}
                  {groups.filter((g) => g.org_id === r.org_id).length > 0 && (
                    <select
                      className="input"
                      style={{ display: 'block', width: '100%', marginTop: '0.6rem', fontSize: '0.8rem' }}
                      value={r.deployment_group_id ?? ''}
                      onChange={(e) => void assignRuntimeGroup(r.id, e.target.value)}
                      aria-label="Deployment group"
                    >
                      <option value="">No group</option>
                      {groups
                        .filter((g) => g.org_id === r.org_id)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  )}
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.73rem', color: 'var(--muted)' }}>
                    {r.last_seen_at ? timeAgo(r.last_seen_at) : 'never seen'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'map' && (
        <div className="section__body panel-glass">
          {!mapOrgId ? (
            <EmptyState title="Select an organization" description="Fleet map and dispatch require a single org — pick one from the dropdown." />
          ) : !advancedFleet ? (
            <EmptyState
              title="Advanced fleet controls"
              description="Regional map, deployment groups, and dispatch require Team plan or higher. Kill switch and runtime list are available on all plans."
            >
              <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => onPage?.('billing')}>
                View plans on Billing
              </button>
            </EmptyState>
          ) : !fleetMap ? (
            <p className="hint-line">Loading fleet map…</p>
          ) : (
            <>
              <div className="kpi-grid">
                {[
                  ['Runtimes', fleetMap.summary.runtimes],
                  ['Online', fleetMap.summary.online],
                  ['Agents', fleetMap.summary.agents],
                  ['Verified', fleetMap.summary.verified],
                ].map(([label, n]) => (
                  <article key={label as string} className="kpi-card">
                    <p className="kpi-card__label">{label}</p>
                    <p className="kpi-card__value">{n}</p>
                  </article>
                ))}
              </div>

              <h2 className="section-title">By region</h2>
              {fleetMap.regions.length === 0 ? (
                <EmptyState title="No regions" description="Assign a region when connecting runtimes to enable geographic grouping." />
              ) : (
                <div className="fleet-region-bars" style={{ marginBottom: '1.5rem' }}>
                  {fleetMap.regions.map((reg) => {
                    const pct = reg.total > 0 ? Math.round((reg.online / reg.total) * 100) : 0
                    return (
                      <div key={reg.region} className="fleet-region-bar">
                        <div className="fleet-region-bar__head">
                          <strong>{reg.region}</strong>
                          <span>{reg.online}/{reg.total} online</span>
                        </div>
                        <div className="fleet-region-bar__track">
                          <div className="fleet-region-bar__fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <h2 className="section-title">Region detail</h2>
              {fleetMap.regions.length === 0 ? null : (
                <div className="policy-grid" style={{ marginBottom: '1.5rem' }}>
                  {fleetMap.regions.map((reg) => (
                    <article key={reg.region} className="policy-card">
                      <h3 style={{ margin: '0 0 0.35rem' }}>{reg.region}</h3>
                      <p className="hint-line" style={{ margin: 0 }}>
                        {reg.online} online · {reg.total} total
                      </p>
                      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
                        {reg.runtimes.slice(0, 5).map((rt) => (
                          <li key={rt.id}>
                            {rt.name} <span className={`badge ${statusBadge(rt.status)}`}>{rt.status}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              )}

              <h2 className="section-title">Deployment groups</h2>
              <div className="policy-card panel-glass" style={{ maxWidth: '28rem', marginBottom: '1rem' }}>
                <label className="hint-line" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  New group name
                  <input
                    className="input"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                </label>
                <label className="hint-line" style={{ display: 'block', margin: '0.5rem 0 0.35rem' }}>
                  Region (optional)
                  <input
                    className="input"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                    value={newGroupRegion}
                    onChange={(e) => setNewGroupRegion(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => void handleCreateGroup()}
                >
                  Create group
                </button>
                {groupMsg && (
                  looksLikeUpgradeMessage(groupMsg) ? (
                    <PlanGateAlert message={groupMsg} onDismiss={() => setGroupMsg(null)} style={{ marginTop: '0.35rem' }} />
                  ) : (
                    <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {groupMsg}
                    </p>
                  )
                )}
              </div>
              {fleetMap.groups.length > 0 ? (
                <div className="policy-grid" style={{ marginBottom: '1.5rem' }}>
                  {fleetMap.groups.map((g) => (
                    <article key={g.id} className="policy-card">
                      <h3 style={{ margin: '0 0 0.35rem' }}>{g.name}</h3>
                      <p className="hint-line" style={{ margin: 0 }}>
                        {g.online}/{g.total} online
                        {g.region ? ` · ${g.region}` : ''}
                      </p>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => {
                          setDispatchGroupId(g.id)
                          setDispatchCmd('ping')
                          setDispatchMsg(`Target set to group "${g.name}" — click Dispatch`)
                        }}
                      >
                        Target for dispatch
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="hint-line" style={{ marginBottom: '1rem' }}>
                  No groups yet — create one above, then assign runtimes on the Runtimes tab.
                </p>
              )}

              <h2 className="section-title">Dispatch command</h2>
              <div className="policy-card panel-glass" style={{ maxWidth: '28rem' }}>
                <label className="hint-line" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  Command
                  <input
                    className="input"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                    value={dispatchCmd}
                    onChange={(e) => setDispatchCmd(e.target.value)}
                  />
                </label>
                <label className="hint-line" style={{ display: 'block', margin: '0.75rem 0 0.35rem' }}>
                  Deployment group (optional)
                  <select
                    className="input"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                    value={dispatchGroupId}
                    onChange={(e) => setDispatchGroupId(e.target.value)}
                  >
                    <option value="">— none —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hint-line" style={{ display: 'block', margin: '0.75rem 0 0.35rem' }}>
                  Region filter (optional)
                  <input
                    className="input"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                    placeholder="e.g. us-west"
                    value={dispatchRegion}
                    onChange={(e) => setDispatchRegion(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => void handleDispatch()}
                >
                  Dispatch
                </button>
                {dispatchMsg && (
                  looksLikeUpgradeMessage(dispatchMsg) ? (
                    <PlanGateAlert message={dispatchMsg} onDismiss={() => setDispatchMsg(null)} style={{ marginTop: '0.5rem' }} />
                  ) : (
                    <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {dispatchMsg}
                    </p>
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'agents' && (
        <>
          {connectAgents.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 0 }}>Connect agents (proxy path)</h2>
              <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Token hint</th>
                      <th>Last seen</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {connectAgents.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>…{a.token_hint}</td>
                        <td style={{ color: 'var(--muted)' }}>{a.last_seen_at ? timeAgo(a.last_seen_at) : 'never'}</td>
                        <td>
                          <span className={`badge ${a.actions_paused ? 'warning' : 'success'}`}>
                            {a.actions_paused ? 'Paused' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={agentPauseLoading === a.id}
                            onClick={() => void toggleAgentPause(a)}
                          >
                            {a.actions_paused ? 'Resume' : 'Pause'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="section-title">{connectAgents.length > 0 ? 'SDK runtime agents' : 'Agents'}</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Runtime</th>
                  <th>Model</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        title={connectAgents.length > 0 ? 'No SDK runtime agents' : 'No agents registered'}
                        description={
                          connectAgents.length > 0
                            ? 'Connect agents above use the proxy path. SDK runtime agents register when a runtime connects via Devices.'
                            : 'Create agents on Connect Agent or register via SDK runtimes on Devices.'
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  agents.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.agent_id}</strong></td>
                      <td>{a.runtime_name ?? a.runtime_id.slice(0, 8)}</td>
                      <td>{a.model ?? '—'}</td>
                      <td><span className="badge neutral">{a.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'events' && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Event</th>
                <th>Agent / runtime</th>
                <th>Details</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      title="No events yet"
                      description="Events are emitted when runtimes connect, agents verify actions, or fleet commands dispatch."
                    />
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td><code className="inline-code">{e.event_type}</code></td>
                    <td style={{ color: 'var(--muted)' }}>{e.agent_id ?? '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.8rem', maxWidth: '20rem' }}>
                      {typeof e.payload === 'object' && e.payload && 'decision' in (e.payload as object)
                        ? String((e.payload as { decision?: string }).decision)
                        : typeof e.payload === 'object' && e.payload
                          ? JSON.stringify(e.payload).slice(0, 80)
                          : '—'}
                    </td>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
