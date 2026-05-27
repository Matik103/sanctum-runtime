import type { ActionResult, PolicyMap, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { CompanionOverview } from '../components/CompanionOverview'
import { decisionTone, timeAgo } from '../lib/format'
import { actionLabel, decisionLabel } from '../lib/labels'
import { auditRecordHeadline } from '../lib/narrative'
import { riskModelMetaLine } from '../lib/risk-label'
import { sparkBars } from '../lib/spark'
import { OctagonX, ShieldCheck } from 'lucide-react'

type Props = {
  audit: ActionResult[]
  policies: PolicyMap
  status: RuntimeStatus | null
  onSelect: (e: ActionResult) => void
  lastRefreshed: Date | null
  companionMode?: boolean
  pendingReviewCount?: number
  onOpenReview?: () => void
  orgId?: string | null
  onPage?: (page: string) => void
}

export function Overview({
  audit,
  policies,
  status,
  onSelect,
  lastRefreshed,
  companionMode,
  pendingReviewCount = 0,
  onOpenReview,
  orgId,
  onPage,
}: Props) {
  const approved = audit.filter((e) => e.decision === 'APPROVED').length
  const blocked = audit.filter((e) => e.decision === 'BLOCKED').length
  const verify = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length
  const shieldCritical = audit.filter((e) => e.shield?.level === 'critical').length
  const shieldActive = audit.some((e) => e.shield && e.shield.level !== 'clear')
  // Threats = blocked + held for review + approved-but-anomalous (flagged actions)
  const blockedOrHeld = audit.filter(
    (e) => e.decision === 'BLOCKED' || e.decision === 'REQUIRE_VERIFICATION',
  ).length
  const flagged = audit.filter(
    (e) => e.decision === 'APPROVED' && e.anomalyFlags.length > 0,
  ).length
  const threats = blockedOrHeld + flagged
  const hasThreat = threats > 0
  const bars = sparkBars(audit)

  if (companionMode) {
    return (
      <>
        <header className="page-header">
          <div>
            <h1>Runtime status</h1>
            <p>Mobile supervision for autonomous systems</p>
          </div>
        </header>
        <CompanionOverview
          audit={audit}
          pendingReviewCount={pendingReviewCount}
          onSelect={onSelect}
          onOpenReview={onOpenReview}
          orgId={orgId}
        />
      </>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Pre-execution trust verification for your AI agent fleet</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`pill ${status?.runtimeOnline === false ? 'warn' : 'ok'}`}>
            <span
              className={`status-dot ${status?.runtimeOnline === false ? 'warn' : 'ok'}`}
              style={{ marginRight: 0 }}
              aria-hidden
            />
            {status === null ? 'Connecting…' : status.runtimeOnline ? 'Runtime online' : 'Runtime offline'}
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
          <div className="card-meta">
            {blockedOrHeld} blocked/held · {flagged} flagged approved
          </div>
        </div>

        <div className="card">
          <div className="card-label">Approval rate</div>
          <div className="card-value" style={{ fontSize: '1.25rem' }}>
            {audit.length ? Math.round((approved / audit.length) * 100) : 100}%
          </div>
          <div className="card-meta">{audit.length ? `${audit.length} actions evaluated` : 'No actions yet'}</div>
        </div>

        {/* Shield status card */}
        <div
          className={`card ${shieldCritical > 0 ? 'glow-danger' : ''}`}
          style={{ cursor: onPage ? 'pointer' : undefined }}
          onClick={() => onPage?.('shield')}
          role={onPage ? 'button' : undefined}
          tabIndex={onPage ? 0 : undefined}
          onKeyDown={(e) => { if (onPage && (e.key === 'Enter' || e.key === ' ')) onPage('shield') }}
          title="Open Sanctum Shield"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {shieldCritical > 0
              ? <OctagonX size={16} color="var(--danger)" />
              : <ShieldCheck size={16} color="var(--success, #10b981)" />}
            <div className="card-label" style={{ margin: 0 }}>Shield</div>
          </div>
          <div className="card-value" style={{ fontSize: '1.1rem', color: shieldCritical > 0 ? 'var(--danger)' : undefined }}>
            {shieldCritical > 0 ? `${shieldCritical} critical` : shieldActive ? 'Active' : 'Clear'}
          </div>
          <div className="card-meta">
            {shieldActive ? 'Behavioral anomalies detected' : 'No threat signals detected'}
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
          <strong style={{ fontSize: '0.9rem' }}>Recent events</strong>
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
                  No events yet. Connect a runtime to begin streaming action events.
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
