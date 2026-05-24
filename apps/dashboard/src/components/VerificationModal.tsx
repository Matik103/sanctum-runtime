import { useEffect, useState } from 'react';
import type { ActionResult } from '@sanctum-runtime/sdk/browser';
import { actionLabel, actorLabel } from '../lib/labels';
import { extractHeardPhrase, extractIntent } from '../lib/narrative';

const GRANT_OPTIONS = [
  { label: 'Once', minutes: undefined },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '8 hours', minutes: 480 },
] as const;

type Props = {
  entry: ActionResult;
  queuePosition?: { current: number; total: number };
  onApproveOnce: (grantMinutes?: number) => Promise<void>;
  onAlwaysApprove: () => Promise<void>;
  onDeny: () => Promise<void>;
};

export function VerificationModal({ entry, queuePosition, onApproveOnce, onAlwaysApprove, onDeny }: Props) {
  const heard = extractHeardPhrase(entry.context);
  const intent = extractIntent(entry.context);
  const [grantMinutes, setGrantMinutes] = useState<number | undefined>(undefined);
  const [showGrantMenu, setShowGrantMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setBusy(true);
        if (e.shiftKey) void onAlwaysApprove().finally(() => setBusy(false));
        else void onApproveOnce(grantMinutes).finally(() => setBusy(false));
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setBusy(true);
        void onDeny().finally(() => setBusy(false));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setBusy(true);
        void onDeny().finally(() => setBusy(false));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onApproveOnce, onAlwaysApprove, onDeny, grantMinutes, busy]);

  const selectedOption = GRANT_OPTIONS.find((o) => o.minutes === grantMinutes) ?? GRANT_OPTIONS[0];

  return (
    <div className="modal-backdrop">
      <section
        className="modal verification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verification-title"
      >
        <div className="verification-modal__content">
          <h2 id="verification-title">Verification required</h2>
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
          {entry.requiresSecondApproval && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 6,
                fontSize: '0.82rem',
              }}
            >
              <strong>Dual approval required.</strong>{' '}
              {entry.firstApprovedBy ? (
                <>
                  First approved by <code>{entry.firstApprovedBy}</code>. A different operator must give the second
                  approval.
                </>
              ) : (
                <>This action needs two distinct approvers before it can execute.</>
              )}
            </div>
          )}
          {entry.escalatedAt && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: 6,
                fontSize: '0.82rem',
              }}
            >
              <strong>Escalated</strong> · pending since {new Date(entry.timestamp).toLocaleTimeString()}
            </div>
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
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', lineHeight: 1.5 }}>{entry.reasoning}</p>
            </div>

            {entry.sourceTrust && (
              <div style={{ marginTop: '0.75rem' }}>
                <span className="card-label">Instruction source</span>
                <p style={{ margin: '0.25rem 0 0' }}>
                  <span
                    className={`badge ${
                      entry.sourceTrust === 'trusted_user' || entry.sourceTrust === 'authenticated_user'
                        ? 'success'
                        : entry.sourceTrust === 'untrusted_content'
                          ? 'danger'
                          : entry.sourceTrust === 'tool_output' || entry.sourceTrust === 'memory'
                            ? 'warn'
                            : 'neutral'
                    }`}
                  >
                    {entry.sourceTrust.replace(/_/g, ' ')}
                  </span>
                  {(entry.sourceTrust === 'untrusted_content' || entry.sourceTrust === 'tool_output') && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
                      ⚠ Possible indirect prompt injection
                    </span>
                  )}
                </p>
              </div>
            )}

            {entry.blastRadius && (
              <div style={{ marginTop: '0.75rem' }}>
                <span className="card-label">Blast radius</span>
                <div
                  style={{
                    marginTop: '0.35rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.35rem',
                    alignItems: 'center',
                  }}
                >
                  <span
                    className={`badge ${
                      entry.blastRadius.level === 'critical'
                        ? 'danger'
                        : entry.blastRadius.level === 'high'
                          ? 'danger'
                          : entry.blastRadius.level === 'medium'
                            ? 'warn'
                            : 'neutral'
                    }`}
                  >
                    {entry.blastRadius.level} · {entry.blastRadius.score}/100
                  </span>
                  {!entry.blastRadius.reversible && <span className="badge danger">irreversible</span>}
                  {entry.blastRadius.externalDestination && <span className="badge warn">external</span>}
                  {entry.blastRadius.physicalWorld && <span className="badge danger">physical world</span>}
                  {entry.blastRadius.dataSensitivity && entry.blastRadius.dataSensitivity !== 'public' && (
                    <span className="badge warn">{entry.blastRadius.dataSensitivity} data</span>
                  )}
                  {entry.blastRadius.estimatedValue != null && entry.blastRadius.estimatedValue > 0 && (
                    <span className="badge neutral">${entry.blastRadius.estimatedValue.toLocaleString()} at risk</span>
                  )}
                </div>
                {entry.blastRadius.factors.length > 0 && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {entry.blastRadius.factors.join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="verification-modal__decision">
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
            Shortcuts: <kbd>A</kbd> approve · <kbd>Shift+A</kbd> always approve · <kbd>D</kbd> deny
          </p>

          {showGrantMenu && (
            <div
              id="verification-grant-options"
              className="verification-grant-options"
              role="group"
              aria-label="Approval duration"
            >
              <span className="card-label">Approval window</span>
              <div className="verification-grant-grid">
                {GRANT_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={`verification-grant-option${opt.minutes === grantMinutes ? ' selected' : ''}`}
                    disabled={busy}
                    aria-pressed={opt.minutes === grantMinutes}
                    onClick={() => {
                      setGrantMinutes(opt.minutes);
                      setShowGrantMenu(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    <small>{opt.minutes === undefined ? 'default' : 'grant window'}</small>
                  </button>
                ))}
              </div>
              <p>Grants only this agent and action during the selected window.</p>
            </div>
          )}

          <div className="modal-actions verification-modal__actions">
            {/* Approve with optional duration */}
            <div className="verification-approve-group">
              <button
                type="button"
                className="btn btn-primary"
                style={{ borderRadius: '8px 0 0 8px', flex: 1 }}
                disabled={busy}
                onClick={() => {
                  setShowGrantMenu(false);
                  setBusy(true);
                  void onApproveOnce(grantMinutes).finally(() => setBusy(false));
                }}
              >
                {busy
                  ? 'Submitting…'
                  : grantMinutes !== undefined
                    ? `Approve for ${selectedOption.label}`
                    : 'Approve once'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                aria-label="Choose approval duration"
                aria-expanded={showGrantMenu}
                aria-controls="verification-grant-options"
                disabled={busy}
                style={{
                  borderLeft: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '0 8px 8px 0',
                  padding: '0 0.6rem',
                }}
                onClick={() => setShowGrantMenu((v) => !v)}
              >
                ▾
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onAlwaysApprove().finally(() => setBusy(false));
              }}
            >
              Always approve
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onDeny().finally(() => setBusy(false));
              }}
            >
              Deny
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
