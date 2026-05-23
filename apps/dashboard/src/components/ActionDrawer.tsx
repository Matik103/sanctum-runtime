import { Brain, X } from 'lucide-react'
import type { ActionResult, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { actionLabel, anomalyLabel, decisionLabel, policyLabel, riskLabel } from '../lib/labels'
import { decisionTone, timeAgo } from '../lib/format'
import { extractHeardPhrase, extractIntent } from '../lib/narrative'
import { AuditRecord } from './AuditRecord'
import { CausalChain } from './CausalChain'
import { ContextDetails } from './ContextDetails'

type Props = {
  entry: ActionResult | null
  onClose: () => void
  audit?: ActionResult[]
  onSelect?: (e: ActionResult) => void
  status?: RuntimeStatus | null
}

function providerDisplayName(provider: string | undefined): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'ollama') return 'Ollama (self-hosted)'
  return provider ?? 'Unknown'
}

export function ActionDrawer({ entry, onClose, audit, onSelect, status }: Props) {
  if (!entry) return null

  const tone = decisionTone(entry.decision)
  const heard = extractHeardPhrase(entry.context)
  const intent = extractIntent(entry.context)
  // Prefer model identity stamped on the audit entry (historical accuracy across
  // provider rotations); fall back to current runtime status for legacy entries.
  const modelProvider = entry.riskModelProvider ?? status?.riskProvider ?? (entry.ollamaConnected ? 'ollama' : undefined)
  const modelName = entry.riskModelName ?? status?.riskModel ?? status?.ollamaModel

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

        {entry.actionIdentity && (
          <section className="drawer-section">
            <h3>Action identity</h3>
            <dl className="detail-list">
              <div>
                <dt>Actor</dt>
                <dd>{entry.actionIdentity.actorId}</dd>
              </div>
              {entry.actionIdentity.toolId && (
                <div>
                  <dt>Tool</dt>
                  <dd>{entry.actionIdentity.toolId}</dd>
                </div>
              )}
              {entry.actionIdentity.runtimeId && (
                <div>
                  <dt>Runtime</dt>
                  <dd>{entry.actionIdentity.runtimeId}</dd>
                </div>
              )}
              {entry.actionIdentity.environmentId && (
                <div>
                  <dt>Environment</dt>
                  <dd>{entry.actionIdentity.environmentId}</dd>
                </div>
              )}
              <div>
                <dt>Permission</dt>
                <dd>{entry.actionIdentity.requestedPermission}</dd>
              </div>
              {entry.actionIdentity.scope.length > 0 && (
                <div>
                  <dt>Scope</dt>
                  <dd>{entry.actionIdentity.scope.join(' · ')}</dd>
                </div>
              )}
              {entry.actionIdentity.expiresAt && (
                <div>
                  <dt>Expiry</dt>
                  <dd>{new Date(entry.actionIdentity.expiresAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

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

        {entry.sourceTrust && (
          <section className="drawer-section">
            <h3>Instruction source</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className={`badge ${
                entry.sourceTrust === 'trusted_user' || entry.sourceTrust === 'authenticated_user' ? 'success' :
                entry.sourceTrust === 'untrusted_content' ? 'danger' :
                entry.sourceTrust === 'tool_output' || entry.sourceTrust === 'memory' ? 'warn' : 'neutral'
              }`}>{entry.sourceTrust.replace(/_/g, ' ')}</span>
              {(entry.sourceTrust === 'untrusted_content' || entry.sourceTrust === 'tool_output') && (
                <span className="badge warn">indirect prompt injection risk</span>
              )}
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.4 }}>
              {entry.sourceTrust === 'trusted_user' && 'Instruction came directly from a trusted human operator.'}
              {entry.sourceTrust === 'authenticated_user' && 'Instruction came from an authenticated user session.'}
              {entry.sourceTrust === 'system' && 'Instruction came from an automated system or scheduler.'}
              {entry.sourceTrust === 'tool_output' && 'Instruction originated from a tool call result — elevated injection risk.'}
              {entry.sourceTrust === 'memory' && 'Instruction was retrieved from agent memory — verify recency and integrity.'}
              {entry.sourceTrust === 'untrusted_content' && 'Instruction came from untrusted external content (web page, email, document). High injection risk.'}
              {entry.sourceTrust === 'unknown' && 'Instruction source could not be determined.'}
            </p>
          </section>
        )}

        {entry.blastRadius && (
          <section className="drawer-section">
            <h3>Blast radius</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
              <span className={`badge ${
                entry.blastRadius.level === 'critical' || entry.blastRadius.level === 'high' ? 'danger' :
                entry.blastRadius.level === 'medium' ? 'warn' : 'neutral'
              }`}>{entry.blastRadius.level} · {entry.blastRadius.score}/100</span>
              {!entry.blastRadius.reversible && <span className="badge danger">irreversible</span>}
              {entry.blastRadius.externalDestination && <span className="badge warn">external destination</span>}
              {entry.blastRadius.physicalWorld && <span className="badge danger">physical world</span>}
              {entry.blastRadius.dataSensitivity && entry.blastRadius.dataSensitivity !== 'public' && (
                <span className="badge warn">{entry.blastRadius.dataSensitivity} data</span>
              )}
              {entry.blastRadius.estimatedValue != null && entry.blastRadius.estimatedValue > 0 && (
                <span className="badge neutral">${entry.blastRadius.estimatedValue.toLocaleString()} at risk</span>
              )}
            </div>
            {entry.blastRadius.factors.length > 0 && (
              <ul style={{ margin: 0, padding: '0 0 0 1.1rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                {entry.blastRadius.factors.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
          </section>
        )}

        {entry.execution && (
          <section className="drawer-section">
            <h3>Execution result</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
              <span className={`badge ${
                entry.execution.status === 'succeeded' ? 'success' :
                entry.execution.status === 'failed' ? 'danger' : 'neutral'
              }`}>{entry.execution.status}</span>
              {entry.execution.durationMs != null && (
                <span className="badge neutral">{Math.round(entry.execution.durationMs)}ms</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              {entry.execution.resultSummary ?? entry.execution.error ?? 'Executor reported completion without additional details.'}
            </p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              {entry.execution.reportedBy ?? 'executor'} · {timeAgo(entry.execution.reportedAt)}
              {entry.execution.outputRef ? ` · ${entry.execution.outputRef}` : ''}
            </p>
          </section>
        )}

        <section className="drawer-section">
          <h3>Policy</h3>
          <p style={{ margin: 0, fontWeight: 500 }}>{policyLabel(entry.policyPath)}</p>
          <p style={{ marginTop: '0.5rem' }}>
            <span className={`badge ${tone}`}>{decisionLabel(entry.decision)}</span>
          </p>
        </section>

        <section className="drawer-section">
          <h3>
            <Brain size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem', opacity: 0.75 }} />
            Decision attribution
          </h3>
          {entry.modelInvoked ? (
            <div className="model-attr">
              <div className="model-attr__row">
                <span className="model-attr__label">Scored by</span>
                <span className="model-attr__value">
                  {modelName ? (
                    <>
                      <code className="inline-code">{modelName}</code>
                      <span style={{ marginLeft: '0.4rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                        · {providerDisplayName(modelProvider)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>AI model</span>
                  )}
                </span>
              </div>
              {typeof entry.modelConfidence === 'number' && (
                <div className="model-attr__row">
                  <span className="model-attr__label">Model confidence</span>
                  <span className="model-attr__value">
                    {(entry.modelConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              <div className="model-attr__row">
                <span className="model-attr__label">Evaluation mode</span>
                <span className="model-attr__value">
                  <code className="inline-code" style={{ fontSize: '0.78rem' }}>{entry.evaluationMode}</code>
                </span>
              </div>
              <p className="model-attr__footnote">
                Risk model output is one input. Final decision combines deterministic policy + heuristics + model score.
              </p>
            </div>
          ) : (
            <div className="model-attr">
              <div className="model-attr__row">
                <span className="model-attr__label">Scored by</span>
                <span className="model-attr__value">Deterministic policy + heuristics</span>
              </div>
              <div className="model-attr__row">
                <span className="model-attr__label">Evaluation mode</span>
                <span className="model-attr__value">
                  <code className="inline-code" style={{ fontSize: '0.78rem' }}>{entry.evaluationMode}</code>
                </span>
              </div>
              <p className="model-attr__footnote">
                No AI model was invoked for this decision — fully deterministic.
              </p>
            </div>
          )}
        </section>

        {audit && audit.length > 0 && (
          <section className="drawer-section">
            <h3>Causal chain</h3>
            <CausalChain entry={entry} audit={audit} onSelect={onSelect} />
          </section>
        )}

        <section className="drawer-section">
          <h3>Timeline</h3>
          <ul className="timeline">
            <li>Request received · {timeAgo(entry.timestamp)}</li>
            <li>Runtime intercepted</li>
            <li>
              {entry.modelInvoked
                ? `Risk analyzed${modelName ? ` (${modelName})` : ' (AI model)'}`
                : 'Policy evaluation'}
            </li>
            <li>Policy checked</li>
            <li>{decisionLabel(entry.decision)}</li>
          </ul>
        </section>
      </aside>
    </>
  )
}
