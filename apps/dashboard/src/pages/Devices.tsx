import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Server, Trash2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { Alert } from '../components/ui/Alert'
import { CopyField } from '../components/ui/CopyField'
import { EmptyState } from '../components/ui/EmptyState'
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  type ApiKeyRecord,
  type CreateApiKeyResult,
} from '../lib/api-keys'
import { riskModelMetaLine } from '../lib/risk-label'

type Props = { status: RuntimeStatus | null }

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function Devices({ status }: Props) {
  const modelOnline = status?.riskModelConnected ?? status?.ollamaConnected ?? false
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [created, setCreated] = useState<CreateApiKeyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const onDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await deleteApiKey(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const active = keys.filter((k) => !k.revoked_at)
  const apiUrl =
    (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') ||
    'https://sanctum-api-6zgy.onrender.com'

  const envSnippet = created
    ? `SANCTUM_API_URL=${apiUrl}\nSANCTUM_API_KEY=${created.secret}`
    : `SANCTUM_API_URL=${apiUrl}\nSANCTUM_API_KEY=sk_sanctum_...`

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices & API keys</h1>
          <p>Credentials for CI, agents, and runtime SDK scripts</p>
        </div>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <section className="section">
        <div className="section__header">
          <h2>
            <KeyRound size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            API keys
          </h2>
          <p>
            Send as <code className="inline-code">X-Sanctum-Key</code> or set{' '}
            <code className="inline-code">SANCTUM_API_KEY</code>
          </p>
        </div>

        <div className="section__body">
          <p className="hint-line">
            Create a key for <code>npm run example:connect</code>, robotics hosts, or CI pipelines.
          </p>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              void onCreate()
            }}
          >
            <input
              className="input"
              placeholder="Key name (e.g. warehouse-bot)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>
              Create key
            </button>
          </form>

          {created && (
            <div className="secret-banner">
              <div className="secret-banner__head">
                <p className="secret-banner__title">Key created — copy before you dismiss</p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCreated(null)}
                >
                  Dismiss
                </button>
              </div>
              <CopyField
                label="API key"
                value={created.secret}
                hint="Shown once only. Store in your secrets manager."
              />
              <CopyField
                label="Environment file"
                value={envSnippet}
                hint="Paste into .env, then run npm run example:connect"
              />
            </div>
          )}

          {active.length === 0 ? (
            <EmptyState
              title="No API keys yet"
              description="Create one above to connect runtimes and scripts to the control plane."
            />
          ) : (
            <div className="table-wrap" style={{ marginTop: '1.25rem' }}>
              <table className="data key-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Secret key</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {active.map((k) => (
                    <tr key={k.id} className={deletingId === k.id ? 'key-row--pending' : ''}>
                      <td>
                        <strong>{k.name}</strong>
                      </td>
                      <td>
                        <code className="key-prefix">
                          {k.display_key ?? `${k.key_prefix}…${k.key_suffix ?? ''}`}
                        </code>
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{formatDate(k.created_at)}</td>
                      <td style={{ color: 'var(--muted)' }}>{formatDate(k.last_used_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm key-delete-trigger"
                          disabled={busy || deletingId != null}
                          onClick={() => void onDelete(k.id)}
                          aria-label={`Delete API key ${k.name}`}
                        >
                          <Trash2 size={15} />
                          {deletingId === k.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__header">
          <h2>
            <Server size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Runtime health
          </h2>
          <p>{riskModelMetaLine(status)}</p>
        </div>

        <div className="section__body">
          <div className="stat-strip">
            <div className="stat-strip__item">
              <p className="stat-strip__label">Risk model</p>
              <p className="stat-strip__value">
                <span className={`badge ${modelOnline ? 'success' : 'neutral'}`}>
                  {modelOnline ? 'Online' : 'Offline capable'}
                </span>
              </p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Policies</p>
              <p className="stat-strip__value">{status?.policyCount ?? 0}</p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Audit entries</p>
              <p className="stat-strip__value">{status?.auditCount ?? 0}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
