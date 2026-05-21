import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { decisionTone, timeAgo } from '../lib/format'
import { actionLabel, decisionLabel } from '../lib/labels'
import { auditRecordHeadline } from '../lib/narrative'
import { TrustScoreRing } from './TrustScoreRing'

type Props = {
  audit: ActionResult[]
  pendingReviewCount: number
  onSelect: (e: ActionResult) => void
  onOpenReview?: () => void
}

function computeTrustScore(audit: ActionResult[]): number {
  if (audit.length === 0) return 94
  const approved = audit.filter((e) => e.decision === 'APPROVED').length
  const blocked = audit.filter((e) => e.decision === 'BLOCKED').length
  const verify = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length
  const base = (approved / audit.length) * 100
  const penalty = blocked * 8 + verify * 4
  return Math.max(12, Math.min(99, base - penalty))
}

export function CompanionOverview({ audit, pendingReviewCount, onSelect, onOpenReview }: Props) {
  const score = computeTrustScore(audit)
  const recent = audit.slice(0, 8)

  return (
    <section className="companion-panel" aria-label="Mobile companion overview">
      <div className="companion-panel__hero">
        <TrustScoreRing score={score} />
        <div className="companion-panel__stats">
          <div>
            <span className="companion-stat__value">{audit.length}</span>
            <span className="companion-stat__label">Actions</span>
          </div>
          <div>
            <span className="companion-stat__value">{pendingReviewCount}</span>
            <span className="companion-stat__label">Pending</span>
          </div>
        </div>
      </div>

      {pendingReviewCount > 0 && onOpenReview && (
        <button type="button" className="companion-verify-cta btn btn-primary" onClick={onOpenReview}>
          Review {pendingReviewCount} verification request{pendingReviewCount === 1 ? '' : 's'}
        </button>
      )}

      <div className="companion-feed">
        <h2 className="companion-feed__title">Live activity</h2>
        {recent.length === 0 ? (
          <p className="companion-feed__empty">No runtime events yet. Connect an agent to stream actions.</p>
        ) : (
          <ul className="companion-feed__list">
            {recent.map((e) => (
              <li key={e.id}>
                <button type="button" className="companion-feed__item" onClick={() => onSelect(e)}>
                  <span className={`badge ${decisionTone(e.decision)}`}>{decisionLabel(e.decision)}</span>
                  <span className="companion-feed__headline">{auditRecordHeadline(e)}</span>
                  <span className="companion-feed__meta">
                    {actionLabel(e.action)} · {timeAgo(e.timestamp)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
