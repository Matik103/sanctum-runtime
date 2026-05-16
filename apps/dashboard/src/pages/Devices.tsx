import type { RuntimeStatus } from '@sanctum-runtime/sdk'

type Props = { status: RuntimeStatus | null }

export function Devices({ status }: Props) {
  const connected = status?.ollamaConnected ?? false

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices</h1>
          <p>Connected runtimes and agents on this instance</p>
        </div>
      </header>

      <div className="policy-grid">
        <div className="policy-card">
          <h3>Local runtime</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
            {status?.ollamaModel ?? 'Configure OLLAMA_MODEL in .env'}
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <span className={`badge ${connected ? 'success' : 'neutral'}`}>
              {connected ? 'Online' : 'Offline capable'}
            </span>
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Actions in audit: <strong>{status?.auditCount ?? 0}</strong>
          </p>
          <p style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
            Policies loaded: <strong>{status?.policyCount ?? 0}</strong>
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Endpoint: {status?.ollamaUrl ?? 'Set OLLAMA_URL in .env'}
          </p>
        </div>

        <div className="policy-card" style={{ opacity: 0.85 }}>
          <h3>Registered agents</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
            Agents appear here when you pass an <code>actor</code> from your app via the SDK or API.
            Fleet registration and attestation ship in a later release.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <span className="badge neutral">No agents yet</span>
          </p>
        </div>
      </div>
    </>
  )
}
