import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import { TabBar } from '../components/ui/TabBar'
import {
  dispatchFleetCommand,
  fetchFleetAgents,
  fetchFleetEvents,
  fetchFleetMap,
  fetchMyOrgs,
  fetchRuntimes,
  type FleetAgent,
  type FleetEvent,
  type FleetMap,
  type FleetOrg,
  type FleetRuntime,
} from '../lib/fleet'

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

export function Fleet() {
  const [runtimes, setRuntimes] = useState<FleetRuntime[]>([])
  const [agents, setAgents] = useState<FleetAgent[]>([])
  const [events, setEvents] = useState<FleetEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'runtimes' | 'map' | 'agents' | 'events'>('runtimes')
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [fleetMap, setFleetMap] = useState<FleetMap | null>(null)
  const [dispatchCmd, setDispatchCmd] = useState('ping')
  const [dispatchRegion, setDispatchRegion] = useState('')
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null)

  useEffect(() => {
    void fetchMyOrgs().then((list) => setOrgs(list))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const filter = orgId || undefined
      const [rt, ev] = await Promise.all([
        fetchRuntimes(filter),
        fetchFleetEvents(80, filter),
      ])
      setRuntimes(rt)
      setEvents(ev)
      setAgents(await fetchFleetAgents())
      const mapOrg = filter ?? orgs[0]?.org_id
      if (mapOrg) {
        setFleetMap(await fetchFleetMap(mapOrg))
      } else {
        setFleetMap(null)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fleet data unavailable')
    }
  }, [orgId, orgs])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  const mapOrgId = orgId || orgs[0]?.org_id || ''

  const tabs = [
    { id: 'runtimes' as const, label: 'Runtimes', count: runtimes.length },
    { id: 'map' as const, label: 'Map', count: fleetMap?.regions.length ?? 0 },
    { id: 'agents' as const, label: 'Agents', count: agents.length },
    { id: 'events' as const, label: 'Events', count: events.length },
  ]

  async function handleDispatch() {
    if (!mapOrgId) {
      setDispatchMsg('Select an organization first')
      return
    }
    try {
      const res = await dispatchFleetCommand({
        organizationId: mapOrgId,
        command: dispatchCmd.trim(),
        payload: { source: 'dashboard' },
        region: dispatchRegion.trim() || undefined,
      })
      setDispatchMsg(`Dispatched to ${res.targetCount} runtime(s)`)
    } catch (e) {
      setDispatchMsg(e instanceof Error ? e.message : 'Dispatch failed')
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Fleet</h1>
          <p>Registered runtimes, agents, and live event stream</p>
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
            <RefreshCw size={15} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
            Refresh
          </button>
        </PageActions>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.9 }}>
            Connect a runtime with <code className="inline-code">runtime.connect()</code> — see{' '}
            <a
              href="https://github.com/Matik103/sanctum-runtime/blob/main/docs/CONTROL_PLANE.md"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#93b4ff' }}
            >
              CONTROL_PLANE.md
            </a>
          </p>
        </Alert>
      )}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'runtimes' && (
        <>
          {runtimes.length === 0 ? (
            <div className="section__body">
            <EmptyState
              title="No runtimes in this view"
              description={
                orgId
                  ? 'Try “All organizations”, or connect with your workspace org id (Devices → API key, then SANCTUM_ORG_ID).'
                  : 'Connect a host with runtime.connect() using your workspace organization id — not demo-org.'
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
                      {(() => {
                        const t = trustBadge(r.attestation_status ?? 'unverified')
                        return <span className={`badge ${t.className}`}>{t.label}</span>
                      })()}
                      <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                    </div>
                  </div>
                  <p className="hint-line" style={{ margin: '0.35rem 0' }}>
                    {r.org_id} · {r.mode}
                    {r.region ? ` · ${r.region}` : ''} · trust {r.trust_score}
                    {r.attested_at && (
                      <> · attested {new Date(r.attested_at).toLocaleDateString()}</>
                    )}
                  </p>
                  {r.active_model && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                      Model <strong>{r.active_model}</strong>
                    </p>
                  )}
                  {r.current_task && (
                    <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {r.current_task}
                    </p>
                  )}
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Last seen {r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : '—'}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'map' && (
        <div className="section__body">
          {!mapOrgId ? (
            <EmptyState
              title="Select an organization"
              description="Fleet map and dispatch require a single org — pick one from the dropdown."
            />
          ) : !fleetMap ? (
            <p className="hint-line">Loading fleet map…</p>
          ) : (
            <>
              <div className="policy-grid" style={{ marginBottom: '1.25rem' }}>
                {[
                  ['Runtimes', fleetMap.summary.runtimes],
                  ['Online', fleetMap.summary.online],
                  ['Agents', fleetMap.summary.agents],
                  ['Verified', fleetMap.summary.verified],
                ].map(([label, n]) => (
                  <article key={label as string} className="policy-card">
                    <p className="hint-line" style={{ margin: 0 }}>
                      {label}
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 600 }}>{n}</p>
                  </article>
                ))}
              </div>

              <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>By region</h2>
              {fleetMap.regions.length === 0 ? (
                <EmptyState
                  title="No regions"
                  description="Pass region on runtime.connect() or metadata.region."
                />
              ) : (
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

              {fleetMap.groups.length > 0 && (
                <>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Deployment groups</h2>
                  <div className="policy-grid" style={{ marginBottom: '1.5rem' }}>
                    {fleetMap.groups.map((g) => (
                      <article key={g.id} className="policy-card">
                        <h3 style={{ margin: '0 0 0.35rem' }}>{g.name}</h3>
                        <p className="hint-line" style={{ margin: 0 }}>
                          {g.online}/{g.total} online
                          {g.region ? ` · ${g.region}` : ''}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}

              <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Dispatch command</h2>
              <div className="policy-card" style={{ maxWidth: '28rem' }}>
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
                  <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {dispatchMsg}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'agents' && (
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
                      title="No agents"
                      description="Call runtime.registerAgent() after connect()."
                    />
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.agent_id}</strong>
                    </td>
                    <td>{a.runtime_name ?? a.runtime_id.slice(0, 8)}</td>
                    <td>{a.model ?? '—'}</td>
                    <td>
                      <span className="badge neutral">{a.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'events' && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Event</th>
                <th>Agent</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      title="No events yet"
                      description="Emit with runtime.emitEvent() or verify actions while connected."
                    />
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <code className="inline-code">{e.event_type}</code>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{e.agent_id ?? '—'}</td>
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
