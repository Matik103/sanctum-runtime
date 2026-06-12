import { useState, useEffect } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { computeBehavioralTrustScore, trustScoreTone } from '@sanctum-runtime/sdk/browser'
import { decisionTone, timeAgo } from '../lib/format'
import { actionLabel, decisionLabel } from '../lib/labels'
import { auditRecordHeadline } from '../lib/narrative'
import { TrustScoreRing } from './TrustScoreRing'
import { getFleetStatus, fleetPause, fleetResume, type FleetPauseStatus } from '../lib/api'

type Props = {
  audit: ActionResult[]
  pendingReviewCount: number
  onSelect: (e: ActionResult) => void
  onOpenReview?: () => void
  orgId?: string | null
}

export function CompanionOverview({ audit, pendingReviewCount, onSelect, onOpenReview, orgId }: Props) {
  const score = computeBehavioralTrustScore(
    audit.map((e) => ({
      decision: e.decision,
      anomalyFlags: e.anomalyFlags,
      shield: e.shield,
      timestamp: e.timestamp,
    })),
  )
  const recent = audit.slice(0, 8)
  const [fleetStatus, setFleetStatus] = useState<FleetPauseStatus | null>(null)
  const [fleetLoading, setFleetLoading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    getFleetStatus(orgId).then(setFleetStatus).catch(() => {})
  }, [orgId])

  const toggleFleet = async () => {
    if (!orgId || fleetLoading) return
    setFleetLoading(true)
    try {
      const result = fleetStatus?.paused
        ? await fleetResume(orgId)
        : await fleetPause(orgId)
      setFleetStatus(result)
    } catch { /* best-effort */ } finally {
      setFleetLoading(false)
    }
  }

  return (
    <section className="companion-panel" aria-label="Mobile companion overview">
      <div className="companion-panel__hero">
        <div className="companion-panel__score">
          <TrustScoreRing score={score} tone={trustScoreTone(score)} />
          <span className="companion-score__caption">Behavioral health</span>
          <span className="companion-score__hint">
            {score == null ? 'No actions in 24h' : 'Last 24h'}
          </span>
        </div>
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

      {orgId && (
        <div style={{ marginBottom: '1rem' }}>
          {fleetStatus?.paused && (
            <div className="alert alert--warn" role="alert" style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
              <div className="alert__body">
                <strong>Fleet paused</strong> — all agent actions are blocked.
                {fleetStatus.pausedAt && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', opacity: 0.8 }}>
                    since {new Date(fleetStatus.pausedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            className={`btn ${fleetStatus?.paused ? 'btn-primary' : 'btn-danger'}`}
            style={{ width: '100%', fontWeight: 600 }}
            onClick={() => void toggleFleet()}
            disabled={fleetLoading}
          >
            {fleetLoading ? 'Working…' : fleetStatus?.paused ? '▶ Resume Fleet' : '⏸ Pause Fleet (kill switch)'}
          </button>
        </div>
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
