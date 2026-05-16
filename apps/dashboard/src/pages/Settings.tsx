import { Settings2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk'
import { riskModelMetaLine } from '../lib/risk-label'

type Props = { status: RuntimeStatus | null }

export function Settings({ status }: Props) {
  const operational = status?.runtimeOnline !== false
  const provider = status?.riskProvider ?? (status?.ollamaConnected ? 'ollama' : 'none')
  const modelReady = status?.riskModelConnected ?? status?.ollamaConnected ?? false

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Runtime configuration and model connectivity</p>
        </div>
      </header>

      <section className="section">
        <div className="section__header">
          <h2>
            <Settings2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Runtime
          </h2>
          <p>{riskModelMetaLine(status)}</p>
        </div>
        <div className="section__body">
          <div className="stat-strip">
            <div className="stat-strip__item">
              <p className="stat-strip__label">API status</p>
              <p className="stat-strip__value">
                <span style={{ color: operational ? 'var(--success)' : 'var(--danger)' }}>
                  {operational ? 'Operational' : 'Unavailable'}
                </span>
              </p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Policies</p>
              <p className="stat-strip__value">{status?.policyCount ?? '—'}</p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Audit entries</p>
              <p className="stat-strip__value">{status?.auditCount ?? '—'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__header">
          <h2>Risk model</h2>
          <p>Configure OPENAI_API_KEY or OLLAMA on the API host for live scoring</p>
        </div>
        <div className="section__body">
          <dl className="detail-list">
            <div>
              <dt>Provider</dt>
              <dd>{provider}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                <span className={`badge ${modelReady ? 'success' : 'neutral'}`}>
                  {modelReady ? 'Connected' : provider === 'none' ? 'Not configured' : 'Disconnected'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>
                {status?.riskEndpoint ?? status?.ollamaUrl ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Active model</dt>
              <dd>{status?.riskModel ?? status?.ollamaModel ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  )
}
