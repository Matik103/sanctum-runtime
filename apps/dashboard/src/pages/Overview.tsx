import type { ActionResult, PolicyMap, RuntimeStatus } from '@sanctum/sdk'
import { decisionTone, timeAgo } from '../lib/format'

type Props = {
  audit: ActionResult[]
  policies: PolicyMap
  status: RuntimeStatus | null
  loading: boolean
  onRunDemo: (offline: boolean) => void
  onSelect: (e: ActionResult) => void
}

export function Overview({ audit, policies, status, loading, onRunDemo, onSelect }: Props) {
  const approved = audit.filter((e) => e.decision === 'APPROVED').length
  const blocked = audit.filter((e) => e.decision === 'BLOCKED').length
  const verify = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length
  const threats = audit.filter(
    (e) => e.decision !== 'APPROVED' || e.anomalyFlags.length > 0,
  ).length
  const hasThreat = threats > 0

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Sanctum Runtime</h1>
          <p>Trusted runtime infrastructure — mission control</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pill ok">Local runtime active</span>
          <span className="pill">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading}
          onClick={() => onRunDemo(false)}
        >
          Demo: unlock door (online)
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading}
          onClick={() => onRunDemo(true)}
        >
          Demo: unlock door (offline)
        </button>
      </div>

      <div className="grid-4">
        <div className="card glow-success">
          <div className="runtime-pulse">
            <span style={{ fontSize: '1.25rem' }}>◉</span>
          </div>
          <div className="card-label">Runtime status</div>
          <div className="card-value" style={{ fontSize: '1.1rem' }}>
            {status?.ollamaConnected ? 'Operational' : 'Degraded'}
          </div>
          <div className="card-meta">
            {status?.ollamaModel ?? 'No model'} · {Object.keys(policies).length} policies
          </div>
        </div>

        <div className="card">
          <div className="card-label">Actions processed</div>
          <div className="card-value">{audit.length}</div>
          <div className="card-meta">
            {approved} approved · {blocked} blocked · {verify} verify
          </div>
          <div className="spark">
            {[4, 7, 5, 9, 6, 8, 4].map((h, i) => (
              <span key={i} style={{ height: `${h * 4}px` }} />
            ))}
          </div>
        </div>

        <div className={`card ${hasThreat ? 'glow-danger' : ''}`}>
          <div className="card-label">Threat activity</div>
          <div className="card-value">{threats}</div>
          <div className="card-meta">Suspicious or held actions in log</div>
        </div>

        <div className="card">
          <div className="card-label">Trust integrity</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>
            {audit.length ? Math.round((approved / audit.length) * 100) : 100}%
          </div>
          <div className="card-meta">Policy enforcement · local uptime</div>
        </div>
      </div>

      <div className="table-wrap">
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <strong style={{ fontSize: '0.9rem' }}>Live event stream</strong>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Status</th>
              <th>Action</th>
              <th>Decision</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No events yet — run a demo
                </td>
              </tr>
            ) : (
              audit.slice(0, 12).map((e) => (
                <tr key={e.id} className="feed-row" onClick={() => onSelect(e)}>
                  <td>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {e.decision === 'APPROVED' ? '●' : e.decision === 'BLOCKED' ? '●' : '●'}
                    </span>
                  </td>
                  <td>{e.action}</td>
                  <td>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {e.decision.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{timeAgo(e.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
