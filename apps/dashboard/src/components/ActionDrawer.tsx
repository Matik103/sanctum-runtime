import { X } from 'lucide-react'
import type { ActionResult } from '@sanctum-runtime/sdk'
import { actionLabel, anomalyLabel, decisionLabel, policyLabel, riskLabel } from '../lib/labels'
import { decisionTone, timeAgo } from '../lib/format'
import { extractHeardPhrase, extractIntent } from '../lib/narrative'
import { AuditRecord } from './AuditRecord'
import { ContextDetails } from './ContextDetails'

type Props = {
  entry: ActionResult | null
  onClose: () => void
}

export function ActionDrawer({ entry, onClose }: Props) {
  if (!entry) return null

  const tone = decisionTone(entry.decision)
  const heard = extractHeardPhrase(entry.context)
  const intent = extractIntent(entry.context)

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

        {entry.humanResolution && (
          <section className="drawer-section">
            <h3>Human review</h3>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>{entry.humanResolution}</p>
            {entry.resolvedAt && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                {entry.resolvedBy ?? 'Operator'} · {timeAgo(entry.resolvedAt)}
              </p>
            )}
          </section>
        )}

        <section className="drawer-section">
          <h3>Audit record</h3>
          <div className="audit-record audit-record--drawer">
            <AuditRecord entry={entry} />
          </div>
        </section>

        {(heard || intent) && (
          <section className="drawer-section">
            <h3>What was said</h3>
            {heard && (
              <blockquote
                style={{
                  margin: '0 0 0.75rem',
                  padding: '0.65rem 0.85rem',
                  borderLeft: '3px solid var(--accent)',
                  background: 'rgba(79, 124, 255, 0.08)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}
              >
                {heard}
              </blockquote>
            )}
            {intent && (
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--foreground)' }}>Stated intent:</strong> {intent}
              </p>
            )}
          </section>
        )}

        <section className="drawer-section">
          <h3>Scene details</h3>
          <ContextDetails context={entry.context} actor={entry.actor} />
        </section>

        {entry.anomalyFlags.length > 0 && (
          <section className="drawer-section">
            <h3>Signals</h3>
            <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {entry.anomalyFlags.map((f) => (
                <span key={f} className="badge warning">
                  {anomalyLabel(f)}
                </span>
              ))}
            </p>
          </section>
        )}

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
              {entry.modelInvoked ? 'Risk analyzed (AI model)' : 'Policy evaluation'}
            </li>
            <li>Policy checked</li>
            <li>{decisionLabel(entry.decision)}</li>
          </ul>
        </section>
      </aside>
    </>
  )
}
