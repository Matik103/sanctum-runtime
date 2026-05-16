import { useCallback, useEffect, useState } from 'react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk'
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRecord,
  type CreateApiKeyResult,
} from '../lib/api-keys'

type Props = { status: RuntimeStatus | null }

export function Devices({ status }: Props) {
  const connected = status?.ollamaConnected ?? false
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [created, setCreated] = useState<CreateApiKeyResult | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setKeys(await listApiKeys())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load API keys')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreate = async () => {
    if (!newName.trim()) return
    setBusy(true)
    try {
      const row = await createApiKey(newName.trim())
      setCreated(row)
      setNewName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const onRevoke = async (id: string) => {
    setBusy(true)
    try {
      await revokeApiKey(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusy(false)
    }
  }

  const active = keys.filter((k) => !k.revoked_at)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices & API keys</h1>
          <p>Runtimes, agents, and script credentials for this control plane</p>
        </div>
      </header>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="policy-grid">
        <div className="policy-card">
          <h3>Local runtime</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
            {status?.riskProvider === 'openai'
              ? `OpenAI-compatible · ${status.riskModel ?? 'model'}`
              : status?.ollamaModel ?? 'Heuristic / offline mode'}
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <span className={`badge ${connected || status?.riskModelConnected ? 'success' : 'neutral'}`}>
              {status?.riskModelConnected || connected ? 'Risk model online' : 'Offline capable'}
            </span>
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Actions in audit: <strong>{status?.auditCount ?? 0}</strong>
          </p>
          <p style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
            Policies loaded: <strong>{status?.policyCount ?? 0}</strong>
          </p>
        </div>

        <div className="policy-card">
          <h3>API keys</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
            Create keys for CI, agents, and scripts. Use header{' '}
            <code>X-Sanctum-Key: sk_sanctum_…</code>
          </p>

          <div className="toolbar" style={{ marginTop: '0.75rem' }}>
            <input
              className="input"
              placeholder="Key name (e.g. ci-deploy)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onCreate()}>
              Create key
            </button>
          </div>

          {created && (
            <div
              className="card"
              style={{
                marginTop: '0.75rem',
                borderColor: 'var(--success)',
                background: 'var(--success-soft)',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                <strong>Copy now:</strong>{' '}
                <code style={{ wordBreak: 'break-all' }}>{created.secret}</code>
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setCreated(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0' }}>
            {active.length === 0 && (
              <li style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No active keys</li>
            )}
            {active.map((k) => (
              <li
                key={k.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.85rem',
                }}
              >
                <span>
                  <strong>{k.name}</strong>
                  <br />
                  <code style={{ color: 'var(--muted)' }}>{k.key_prefix}…</code>
                </span>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void onRevoke(k.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
