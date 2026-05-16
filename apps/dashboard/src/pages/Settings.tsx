import type { RuntimeStatus } from '@sanctum-runtime/sdk'

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

      <div className="policy-grid">
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Runtime</h3>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                <strong style={{ color: operational ? 'var(--success)' : 'var(--danger)' }}>
                  {operational ? 'Operational' : 'Unavailable'}
                </strong>
              </dd>
            </div>
            <div>
              <dt>Policies loaded</dt>
              <dd>{status?.policyCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Audit entries</dt>
              <dd>{status?.auditCount ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Risk model</h3>
          <dl className="detail-list">
            <div>
              <dt>Provider</dt>
              <dd>{provider}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <strong style={{ color: modelReady ? 'var(--success)' : 'var(--muted)' }}>
                  {modelReady ? 'Connected' : provider === 'none' ? 'Not configured' : 'Disconnected'}
                </strong>
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd style={{ wordBreak: 'break-all' }}>
                {status?.riskEndpoint ?? status?.ollamaUrl ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Active model</dt>
              <dd>{status?.riskModel ?? status?.ollamaModel ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
