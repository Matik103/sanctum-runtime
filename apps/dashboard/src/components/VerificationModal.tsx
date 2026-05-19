import { useEffect, useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { actionLabel, actorLabel } from '../lib/labels'
import { extractHeardPhrase, extractIntent } from '../lib/narrative'

const GRANT_OPTIONS = [
  { label: 'Once', minutes: undefined },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '8 hours', minutes: 480 },
] as const

type Props = {
  entry: ActionResult
  queuePosition?: { current: number; total: number }
  onApproveOnce: (grantMinutes?: number) => Promise<void>
  onAlwaysApprove: () => Promise<void>
  onDeny: () => Promise<void>
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
  const [grantMinutes, setGrantMinutes] = useState<number | undefined>(undefined)
  const [showGrantMenu, setShowGrantMenu] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        if (e.shiftKey) onAlwaysApprove()
        else onApproveOnce(grantMinutes)
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        onDeny()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onDeny()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onApproveOnce, onAlwaysApprove, onDeny, grantMinutes])

  const selectedOption = GRANT_OPTIONS.find((o) => o.minutes === grantMinutes) ?? GRANT_OPTIONS[0]

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Verification required</h2>
        {queuePosition && queuePosition.total > 1 && (
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 500 }}>
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
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', lineHeight: 1.5, fontStyle: 'italic' }}>
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
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', lineHeight: 1.5 }}>{entry.reasoning}</p>
          </div>
        </div>

        <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
          Shortcuts: <kbd>A</kbd> approve · <kbd>Shift+A</kbd> always approve · <kbd>D</kbd> deny
        </p>

        <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Approve with optional duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ borderRadius: grantMinutes !== undefined ? '8px 0 0 8px' : undefined, flex: 1 }}
              onClick={() => { setShowGrantMenu(false); onApproveOnce(grantMinutes) }}
            >
              {grantMinutes !== undefined
                ? `Approve for ${selectedOption.label}`
                : 'Approve once'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              title="Set approval duration"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', borderRadius: '0 8px 8px 0', padding: '0 0.6rem' }}
              onClick={() => setShowGrantMenu((v) => !v)}
            >
              ▾
            </button>
            {showGrantMenu && (
              <div
                style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 100,
                  background: 'var(--elevated)', border: '1px solid var(--border)',
                  borderRadius: 8, overflow: 'hidden', minWidth: '140px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {GRANT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => { setGrantMinutes(opt.minutes); setShowGrantMenu(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.55rem 1rem', background: 'none', border: 'none',
                      color: opt.minutes === grantMinutes ? 'var(--success)' : 'var(--text)',
                      fontSize: '0.85rem', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {opt.label}
                    {opt.minutes === undefined && (
                      <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>default</span>
                    )}
                    {opt.minutes !== undefined && (
                      <span style={{ color: 'var(--muted)', fontSize: '0.72rem', marginLeft: '0.5rem' }}>grant window</span>
                    )}
                  </button>
                ))}
                <p style={{ margin: 0, padding: '0.5rem 1rem', fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                  Grant auto-approves the same action from this agent during the window.
                </p>
              </div>
            )}
          </div>

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
