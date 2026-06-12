import { AlertTriangle } from 'lucide-react'

type Props = {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warn' | 'neutral'
  impact?: string[]
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'neutral',
  impact,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  const confirmClass =
    variant === 'danger' ? 'btn btn-danger' : variant === 'warn' ? 'btn btn-primary' : 'btn btn-primary'

  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={() => { if (!busy) onCancel() }}
    >
      <div
        className="confirm-modal card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
          {variant !== 'neutral' && (
            <AlertTriangle
              size={20}
              color={variant === 'danger' ? 'var(--danger)' : 'var(--warning)'}
              style={{ flexShrink: 0, marginTop: 2 }}
              aria-hidden
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="confirm-modal-title" style={{ margin: 0, fontSize: '1rem' }}>{title}</h2>
            <p id="confirm-modal-desc" style={{ margin: '0.45rem 0 0', fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              {message}
            </p>
            {impact && impact.length > 0 && (
              <ul className="confirm-modal__impact">
                {impact.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="confirm-modal__actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
