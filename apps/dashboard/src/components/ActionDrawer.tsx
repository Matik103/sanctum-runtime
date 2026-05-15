import { X } from 'lucide-react'
import type { ActionResult } from '@sanctum/runtime'
import { actionLabel } from '../lib/api'
import { decisionTone, timeAgo } from '../lib/format'

type Props = {
  entry: ActionResult | null
  onClose: () => void
}

export function ActionDrawer({ entry, onClose }: Props) {
  if (!entry) return null

  const tone = decisionTone(entry.decision)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label="Action inspection">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <h2>{actionLabel(entry.action)}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <section className="drawer-section">
          <h3>Action details</h3>
          <pre className="code">
            {JSON.stringify(
              { action: entry.action, actor: entry.actor, context: entry.context },
              null,
              2,
            )}
          </pre>
        </section>

        <section className="drawer-section">
          <h3>Risk analysis</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>{entry.reasoning}</p>
          {entry.modelConfidence != null && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Model confidence: {Math.round(entry.modelConfidence * 100)}%
            </p>
          )}
          <p style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${tone}`}>{entry.risk} risk</span>
          </p>
        </section>

        <section className="drawer-section">
          <h3>Policy result</h3>
          <p style={{ margin: 0, fontWeight: 500 }}>{entry.policyPath}</p>
          <p style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${tone}`}>{entry.decision.replace(/_/g, ' ')}</span>
          </p>
        </section>

        <section className="drawer-section">
          <h3>Timeline</h3>
          <ul className="timeline">
            <li>Request received · {timeAgo(entry.timestamp)}</li>
            <li>Runtime intercepted</li>
            <li>
              {entry.modelInvoked ? 'Risk analyzed (Qwen)' : 'Heuristic risk rules applied'}
            </li>
            <li>Policy checked</li>
            <li>
              {entry.decision === 'REQUIRE_VERIFICATION'
                ? 'Human verification required'
                : entry.decision === 'BLOCKED'
                  ? 'Action blocked'
                  : 'Action approved'}
            </li>
          </ul>
        </section>
      </aside>
    </>
  )
}
