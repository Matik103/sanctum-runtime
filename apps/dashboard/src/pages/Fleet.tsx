import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import { TabBar } from '../components/ui/TabBar'
import {
  fetchFleetAgents,
  fetchFleetEvents,
  fetchMyOrgs,
  fetchRuntimes,
  type FleetAgent,
  type FleetEvent,
  type FleetOrg,
  type FleetRuntime,
} from '../lib/fleet'

function statusBadge(status: string) {
  if (status === 'online') return 'success'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

export function Fleet() {
  const [runtimes, setRuntimes] = useState<FleetRuntime[]>([])
  const [agents, setAgents] = useState<FleetAgent[]>([])
  const [events, setEvents] = useState<FleetEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'runtimes' | 'agents' | 'events'>('runtimes')
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState<string>('')

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list.length === 1) setOrgId(list[0].org_id)
    })
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
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fleet data unavailable')
    }
  }, [orgId])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  const tabs = [
    { id: 'runtimes' as const, label: 'Runtimes', count: runtimes.length },
    { id: 'agents' as const, label: 'Agents', count: agents.length },
    { id: 'events' as const, label: 'Events', count: events.length },
  ]

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
                title="No runtimes registered"
                description="Boot an SDK host with connect() — then it appears here with live telemetry."
              />
            </div>
          ) : (
            <div className="policy-grid">
              {runtimes.map((r) => (
                <article key={r.id} className="policy-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{r.name}</h3>
                    <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                  </div>
                  <p className="hint-line" style={{ margin: '0.35rem 0' }}>
                    {r.org_id} · {r.mode} · trust {r.trust_score}
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
