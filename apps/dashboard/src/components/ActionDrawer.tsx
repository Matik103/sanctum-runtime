import { X } from 'lucide-react'
import type { ActionResult } from '@sanctum-runtime/sdk'
import { actionLabel, decisionLabel, policyLabel, riskLabel } from '../lib/labels'
import { decisionTone, timeAgo } from '../lib/format'
import { ContextDetails } from './ContextDetails'

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
          <h3>What happened</h3>
          <ContextDetails context={entry.context} actor={entry.actor} />
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
            <span className={`badge ${tone}`}>{riskLabel(entry.risk)} risk</span>
          </p>
        </section>

        <section className="drawer-section">
          <h3>Policy</h3>
          <p style={{ margin: 0, fontWeight: 500 }}>{policyLabel(entry.policyPath)}</p>
          <p style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${tone}`}>{decisionLabel(entry.decision)}</span>
          </p>
        </section>

        <section className="drawer-section">
          <h3>Timeline</h3>
          <ul className="timeline">
            <li>Request received · {timeAgo(entry.timestamp)}</li>
            <li>Runtime intercepted</li>
            <li>
              {entry.modelInvoked ? 'Risk analyzed (local model)' : 'Heuristic rules applied'}
            </li>
            <li>Policy checked</li>
            <li>{decisionLabel(entry.decision)}</li>
          </ul>
        </section>
      </aside>
    </>
  )
}
