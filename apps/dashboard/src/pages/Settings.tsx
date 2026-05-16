import type { RuntimeStatus } from '@sanctum-runtime/sdk'
import { useAuth } from '../auth/AuthProvider'
import { isSupabaseConfigured } from '../lib/supabase'

type Props = { status: RuntimeStatus | null }

export function Settings({ status }: Props) {
  const { user } = useAuth()
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
            When <code>offlineMode</code> is set or Ollama is unreachable, the runtime uses
            heuristics and policy rules without calling the local model.
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
          <h3 style={{ marginTop: 0 }}>Authentication</h3>
          {isSupabaseConfigured ? (
            <>
              <p style={{ fontSize: '0.85rem' }}>
                Supabase: <strong style={{ color: 'var(--success)' }}>Connected</strong>
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Signed in as {user?.email ?? '—'}. JWT is sent to the runtime API on each request.
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                Setup guide: <code>SUPABASE_SETUP.md</code> in the repo root.
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Supabase not configured — dashboard is open without login. Add{' '}
              <code>SUPABASE_URL</code> and keys to <code>.env</code> (see SUPABASE_SETUP.md).
            </p>
          )}
        </section>
      </div>
    </>
  )
}
