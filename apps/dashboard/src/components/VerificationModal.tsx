import type { ActionResult } from '@sanctum/runtime'
import { actionLabel } from '../lib/api'

type Props = {
  entry: ActionResult
  onApproveOnce: () => void
  onAlwaysApprove: () => void
  onDeny: () => void
}

export function VerificationModal({
  entry,
  onApproveOnce,
  onAlwaysApprove,
  onDeny,
}: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Verification required</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
          Sanctum paused this action until you decide. You remain in control.
        </p>

        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="card-label">Action</span>
            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{actionLabel(entry.action)}</p>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="card-label">Requested by</span>
            <p style={{ margin: '0.25rem 0 0' }}>{entry.actor}</p>
          </div>
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
