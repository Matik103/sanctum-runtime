import { useCallback, useEffect, useState } from 'react'
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

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Fleet</h1>
          <p>Registered runtimes, agents, and live event stream</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {orgs.length > 0 && (
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organization"
            >
              <option value="">All organizations</option>
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--danger)' }}>
          {error}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Connect a runtime with the SDK: <code>runtime.connect()</code> — see{' '}
            <a
              href="https://github.com/Matik103/sanctum-runtime/blob/main/docs/CONTROL_PLANE.md"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#93b4ff' }}
            >
              CONTROL_PLANE.md
            </a>
          </p>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        {(['runtimes', 'agents', 'events'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`chip ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'runtimes' ? 'Runtimes' : t === 'agents' ? 'Agents' : 'Events'}
          </button>
        ))}
      </div>

      {tab === 'runtimes' && (
        <div className="policy-grid">
          {runtimes.length === 0 && (
            <div className="card empty">No runtimes registered — boot an SDK with connect()</div>
          )}
          {runtimes.map((r) => (
            <div key={r.id} className="policy-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{r.name}</h3>
                <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              </div>
              <p style={{ margin: '0.35rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                {r.org_id} · {r.mode} · trust {r.trust_score}
              </p>
              {r.active_model && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem' }}>
                  Model: <strong>{r.active_model}</strong>
                </p>
              )}
              {r.current_task && (
                <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Task: {r.current_task}
                </p>
              )}
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                Last seen: {r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : '—'}
              </p>
            </div>
          ))}
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
                  <td colSpan={4} className="empty">
                    No agents — runtime.registerAgent() after connect()
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
                <th>Type</th>
                <th>Agent</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty">
                    No events — runtime.emitEvent() or policy actions
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <code style={{ fontSize: '0.8rem' }}>{e.event_type}</code>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{e.agent_id ?? '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>
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
