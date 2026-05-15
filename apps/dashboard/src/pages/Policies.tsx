import type { PolicyMap } from '@sanctum/sdk'
import { actionLabel, policyToResponse, type PolicyResponse } from '../lib/api'

type Props = {
  policies: PolicyMap
  audit: { action: string; timestamp: string }[]
  onSetPolicy: (action: string, response: PolicyResponse) => void
}

export function Policies({ policies, audit, onSetPolicy }: Props) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Policies</h1>
          <p>Define trust boundaries — not programming rules</p>
        </div>
      </header>

      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Each policy sets how Sanctum responds when an AI requests an action.{' '}
          <strong style={{ color: 'var(--success)' }}>Approve</strong> runs automatically,{' '}
          <strong style={{ color: 'var(--warning)' }}>Verify</strong> pauses for you,{' '}
          <strong style={{ color: '#fca5a5' }}>Block</strong> denies immediately.
        </p>
      </div>

      <div className="policy-grid">
        {Object.entries(policies).map(([action, policy]) => {
          const response = policyToResponse(policy)
          const last = audit.find((e) => e.action === action)

          return (
            <article key={action} className="policy-card">
              <h3>{actionLabel(action)} policy</h3>
              <p style={{ margin: '0.25rem 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
                Action: <code>{action}</code>
              </p>

              <p className="card-label" style={{ marginTop: '0.75rem' }}>
                Runtime response
              </p>
              <div className="response-select">
                {(['approve', 'verify', 'block'] as PolicyResponse[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`response-btn ${response === r ? `active ${r}` : ''}`}
                    onClick={() => onSetPolicy(action, r)}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              {last && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Last triggered: {new Date(last.timestamp).toLocaleString()}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}
