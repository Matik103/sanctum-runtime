import type { RuntimeStatus } from '@sanctum/runtime'

type Props = { status: RuntimeStatus | null }

export function Settings({ status }: Props) {
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Runtime, models, and security configuration</p>
        </div>
      </header>

      <div className="policy-grid">
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Runtime</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Offline demos skip the model. Heuristic fallback activates when Ollama is
            unreachable.
          </p>
          <ul style={{ color: 'var(--muted)', fontSize: '0.85rem', paddingLeft: '1.2rem' }}>
            <li>Local-only mode: active (Phase 1)</li>
            <li>Cloud sync: not configured</li>
          </ul>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Models</h3>
          <p style={{ fontSize: '0.85rem' }}>
            Ollama:{' '}
            <strong>{status?.ollamaConnected ? 'Connected' : 'Disconnected'}</strong>
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Endpoint: {status?.ollamaUrl ?? 'Set OLLAMA_URL in .env'}
          </p>
          <p style={{ fontSize: '0.85rem' }}>Active model: {status?.ollamaModel ?? '—'}</p>
        </section>

        <section className="card">
          <h3 style={{ marginTop: 0 }}>Security</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            JWT, API keys, and device attestation — Phase 2 (Supabase auth per PRD).
          </p>
        </section>
      </div>
    </>
  )
}
