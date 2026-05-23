import { Brain, Database, Lock, ShieldCheck, Zap } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'

type Props = { status: RuntimeStatus | null }

type ProviderMeta = {
  vendor: string
  region: string
  privacyUrl: string
  termsUrl: string
  /** Whether vendor contractually does NOT train on inference data */
  noTraining: boolean
  /** Vendor data-retention window for API inference */
  retention: string
  /** Headline certifications */
  certifications: string[]
}

const PROVIDER_META: Record<string, ProviderMeta> = {
  openai: {
    vendor: 'OpenAI',
    region: 'US (multi-region)',
    privacyUrl: 'https://openai.com/enterprise-privacy/',
    termsUrl: 'https://openai.com/policies/business-terms/',
    noTraining: true,
    retention: '0 days (API zero-retention by default)',
    certifications: ['SOC 2 Type 2', 'ISO 27001', 'GDPR', 'CCPA'],
  },
  ollama: {
    vendor: 'Self-hosted (Ollama)',
    region: 'Customer infrastructure',
    privacyUrl: '',
    termsUrl: '',
    noTraining: true,
    retention: 'Never leaves your network',
    certifications: ['Inherits customer compliance posture'],
  },
}

export function AIModelCard({ status }: Props) {
  const provider = status?.riskProvider ?? (status?.ollamaConnected ? 'ollama' : 'none')
  const model = status?.riskModel ?? status?.ollamaModel
  const endpoint = status?.riskEndpoint ?? status?.ollamaUrl
  const connected = status?.riskModelConnected ?? status?.ollamaConnected ?? false
  const meta = provider !== 'none' ? PROVIDER_META[provider] : undefined

  if (provider === 'none') {
    return (
      <section className="section">
        <div className="section__header">
          <h2>
            <Brain size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            AI risk scoring
          </h2>
          <p>Not configured — running in deterministic policy-only mode</p>
        </div>
        <div className="section__body">
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: '40rem' }}>
            No AI provider configured. All decisions use deterministic policy rules and heuristics.
            Set <code className="inline-code">OPENAI_API_KEY</code> (or <code className="inline-code">OLLAMA_URL</code>)
            to enable model-backed risk assessment.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="section__header">
        <h2>
          <Brain size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
          AI model card
        </h2>
        <p>
          Transparency disclosure for the active risk-scoring model — what we run, what data leaves your environment, and on what terms
        </p>
      </div>

      <div className="section__body">
        {/* Identity row — model & connection */}
        <div className="model-card__identity">
          <div className="model-card__model">
            <div className="model-card__label">Model</div>
            <div className="model-card__value-lg">{model ?? '—'}</div>
            <div className="model-card__sub">{meta?.vendor ?? provider}</div>
          </div>
          <div className="model-card__health">
            <span className={`model-card__dot ${connected ? 'model-card__dot--ok' : 'model-card__dot--warn'}`} />
            <span className="model-card__health-label">
              {connected ? 'Operational' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Technical metadata — AWS Bedrock-style grid */}
        <dl className="detail-list" style={{ marginTop: '1.25rem' }}>
          <div>
            <dt>Provider</dt>
            <dd>{meta?.vendor ?? provider}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>{meta?.region ?? '—'}</dd>
          </div>
          <div>
            <dt>Endpoint</dt>
            <dd style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>
              {endpoint ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Used for</dt>
            <dd>Pre-execution risk scoring of agent action requests</dd>
          </div>
        </dl>

        {/* Data handling — what AWS/GCP buries in docs, we surface */}
        <div className="model-card__panel" style={{ marginTop: '1.25rem' }}>
          <div className="model-card__panel-title">
            <Database size={14} aria-hidden /> Data handling
          </div>
          <ul className="model-card__list">
            <li>
              <strong>Sent to model:</strong> action name, policy excerpt, and minimal action context (no raw PII unless your policy includes it)
            </li>
            <li>
              <strong>Not sent:</strong> API keys, signing secrets, user passwords, or other Sanctum-managed secrets
            </li>
            <li>
              <strong>Vendor retention:</strong> {meta?.retention}
            </li>
            <li>
              <strong>Training on your data:</strong>{' '}
              <span className={`badge ${meta?.noTraining ? 'success' : 'warn'}`} style={{ fontSize: '0.7rem' }}>
                {meta?.noTraining ? 'Disabled' : 'Check vendor contract'}
              </span>
            </li>
          </ul>
        </div>

        {/* Guardrails */}
        <div className="model-card__panel" style={{ marginTop: '0.75rem' }}>
          <div className="model-card__panel-title">
            <ShieldCheck size={14} aria-hidden /> Safety guardrails
          </div>
          <ul className="model-card__list">
            <li>Deterministic policy rules evaluate before the model — model never overrides a hard policy block</li>
            <li>Risk model is one input; final decision is policy + heuristics + model score combined</li>
            <li>Circuit breaker isolates the model on errors — system falls back to deterministic scoring within 5s</li>
            <li>Every model invocation is recorded in the audit log with its score and reasoning</li>
          </ul>
        </div>

        {/* Compliance */}
        {meta?.certifications && meta.certifications.length > 0 && (
          <div className="model-card__panel" style={{ marginTop: '0.75rem' }}>
            <div className="model-card__panel-title">
              <Lock size={14} aria-hidden /> Vendor compliance attestations
            </div>
            <div className="model-card__chips">
              {meta.certifications.map((c) => (
                <span key={c} className="model-card__chip">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Performance hint */}
        <div className="model-card__panel" style={{ marginTop: '0.75rem' }}>
          <div className="model-card__panel-title">
            <Zap size={14} aria-hidden /> Performance profile
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
            Target latency budget: 800 ms p95. Risk model invocation is bounded by a 120 s timeout and isolated by a circuit breaker —
            if the model is slow or fails, scoring falls back to deterministic policy + heuristics with no decision delay.
          </p>
        </div>

        {/* External docs links */}
        {(meta?.privacyUrl || meta?.termsUrl) && (
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '1rem' }}>
            Vendor docs:{' '}
            {meta.privacyUrl && (
              <a href={meta.privacyUrl} target="_blank" rel="noopener noreferrer" className="inline-link">
                Enterprise privacy
              </a>
            )}
            {meta.privacyUrl && meta.termsUrl && ' · '}
            {meta.termsUrl && (
              <a href={meta.termsUrl} target="_blank" rel="noopener noreferrer" className="inline-link">
                Business terms
              </a>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
