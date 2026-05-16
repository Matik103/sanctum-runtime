import type { ActionResult } from '@sanctum-runtime/sdk'
import { actionLabel, actorLabel } from '../lib/labels'
import { extractHeardPhrase, extractIntent } from '../lib/narrative'

type Props = {
  entry: ActionResult
  queuePosition?: { current: number; total: number }
  onApproveOnce: () => void
  onAlwaysApprove: () => void
  onDeny: () => void
}

export function VerificationModal({
  entry,
  queuePosition,
  onApproveOnce,
  onAlwaysApprove,
  onDeny,
}: Props) {
  const heard = extractHeardPhrase(entry.context)
  const intent = extractIntent(entry.context)

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Verification required</h2>
        {queuePosition && queuePosition.total > 1 && (
          <p
            style={{
              margin: '0.35rem 0 0',
              fontSize: '0.8rem',
              color: 'var(--warning)',
              fontWeight: 500,
            }}
          >
            Reviewing {queuePosition.current} of {queuePosition.total} in your queue
          </p>
        )}
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>
          Sanctum paused this action until you decide. You remain in control.
        </p>

        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="card-label">Action</span>
            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{actionLabel(entry.action)}</p>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="card-label">Requested by</span>
            <p style={{ margin: '0.25rem 0 0' }}>{actorLabel(entry.actor)}</p>
          </div>
          {heard && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="card-label">What was said</span>
              <p
                style={{
                  margin: '0.25rem 0 0',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{heard}&rdquo;
              </p>
            </div>
          )}
          {intent && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="card-label">Stated intent</span>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>{intent}</p>
            </div>
          )}
          <div>
            <span className="card-label">Reason</span>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {entry.reasoning}
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onApproveOnce}>
            Approve once
          </button>
          <button type="button" className="btn btn-ghost" onClick={onAlwaysApprove}>
            Always approve
          </button>
          <button type="button" className="btn btn-danger" onClick={onDeny}>
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
