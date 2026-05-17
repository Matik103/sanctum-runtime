import type { ActionResult, PolicyMap, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { IntegrateQuickstart } from '../components/IntegrateQuickstart'
import { Phase3Onboarding } from '../components/Phase3Onboarding'
import { decisionTone, timeAgo } from '../lib/format'
import { actionLabel, decisionLabel } from '../lib/labels'
import { auditRecordHeadline } from '../lib/narrative'
import { riskModelMetaLine } from '../lib/risk-label'
import { sparkBars } from '../lib/spark'

type Props = {
  audit: ActionResult[]
  policies: PolicyMap
  status: RuntimeStatus | null
  onSelect: (e: ActionResult) => void
  lastRefreshed: Date | null
}

export function Overview({
  audit,
  policies,
  status,
  onSelect,
  lastRefreshed,
}: Props) {
  const approved = audit.filter((e) => e.decision === 'APPROVED').length
  const blocked = audit.filter((e) => e.decision === 'BLOCKED').length
  const verify = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length
  const threats = audit.filter(
    (e) => e.decision !== 'APPROVED' || e.anomalyFlags.length > 0,
  ).length
  const hasThreat = threats > 0
  const bars = sparkBars(audit)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Mission control</h1>
          <p>Verify agent actions, fleet telemetry, and audit — before they execute</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pill ok">
            <span className="status-dot ok" style={{ marginRight: 0 }} aria-hidden />
            Runtime online
          </span>
          <span className="pill" title="Open-source runtime preview">
            v0.1
          </span>
          <span className="pill" title="Auto-refreshes every 5s">
            {lastRefreshed
              ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Connecting…'}
          </span>
        </div>
      </header>

      {audit.length === 0 && (
        <>
          <Phase3Onboarding />
          <IntegrateQuickstart />
        </>
      )}

      <div className="grid-4">
        <div className="card glow-success">
          <div className="runtime-pulse">
            <span style={{ fontSize: '1.25rem' }}>◉</span>
          </div>
          <div className="card-label">Runtime status</div>
          <div className="card-value" style={{ fontSize: '1.1rem' }}>
            {status === null
              ? 'Connecting…'
              : status.runtimeOnline
                ? status.riskModelConnected || status.ollamaConnected
                  ? 'Operational'
                  : 'Online · offline mode'
                : 'Offline'}
          </div>
          <div className="card-meta">
            {riskModelMetaLine(status)} · {Object.keys(policies).length} policies
          </div>
        </div>

        <div className="card">
          <div className="card-label">Actions processed</div>
          <div className="card-value">{audit.length}</div>
          <div className="card-meta">
            {approved} approved · {blocked} blocked · {verify} verify
          </div>
          <div className="spark">
            {bars.map((h, i) => (
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
              <th>Record</th>
              <th>Decision</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No events yet — run <code>npm run seed:production</code> (see Phase 3 card above)
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
                  <td style={{ maxWidth: '22rem' }}>
                    <span style={{ fontWeight: 500 }}>{auditRecordHeadline(e)}</span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        marginTop: '0.15rem',
                      }}
                    >
                      {actionLabel(e.action)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {decisionLabel(e.decision)}
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
