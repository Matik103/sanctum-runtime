import { useCallback, useEffect, useState } from 'react'
import { timeAgo } from '../lib/format'
import { KeyRound, Monitor, RefreshCw, RotateCcw, Server, Trash2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { Alert } from '../components/ui/Alert'
import { CopyField } from '../components/ui/CopyField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  rotateApiKey,
  type ApiKeyRecord,
  type CreateApiKeyResult,
} from '../lib/api-keys'
import { apiBaseUrl } from '../lib/api-url'
import { fetchMyOrgs, fetchRuntimes, type FleetOrg, type FleetRuntime } from '../lib/fleet'
import { fetchOperatorContext } from '../lib/marketplace'
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

function runtimeStatusBadge(status: string) {
  if (status === 'online') return 'success'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

function DeviceDetails({ runtime: r }: { runtime: import('../lib/fleet').FleetRuntime }) {
  const report = (r.attestation_report ?? {}) as Record<string, unknown>
  const tel = (r.telemetry ?? {}) as Record<string, unknown>

  const items: [string, string][] = []
  if (report.hostname) items.push(['Host', String(report.hostname)])
  if (report.platform) items.push(['OS', String(report.platform)])
  if (report.arch) items.push(['Arch', String(report.arch)])
  if (report.nodeVersion) items.push(['Node', String(report.nodeVersion)])
  if (report.runtimeKind && report.runtimeKind !== 'node') items.push(['Runtime', String(report.runtimeKind)])
  if (typeof report.cpuCount === 'number') items.push(['CPUs', String(report.cpuCount)])
  if (typeof report.totalMemoryMb === 'number') {
    const gb = report.totalMemoryMb >= 1024
      ? `${(report.totalMemoryMb / 1024).toFixed(1)} GB`
      : `${report.totalMemoryMb} MB`
    items.push(['RAM', gb])
  }
  if (report.containerEnv && report.containerEnv !== 'none') items.push(['Container', String(report.containerEnv)])
  if (report.cloudProvider && report.cloudProvider !== 'none') items.push(['Cloud', String(report.cloudProvider)])
  if (typeof tel.lastIp === 'string') items.push(['IP', tel.lastIp])
  if (typeof r.metadata?.lastIp === 'string' && !tel.lastIp) items.push(['IP', String(r.metadata.lastIp)])

  if (items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.75rem', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid var(--border)' }}>
      {items.map(([label, value]) => (
        <span key={label} style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text-secondary, var(--text))' }}>{label}</strong>{' '}{value}
        </span>
      ))}
    </div>
  )
}

export function Devices({ status }: Props) {
  const modelOnline = status?.riskModelConnected ?? status?.ollamaConnected ?? false
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [runtimes, setRuntimes] = useState<FleetRuntime[]>([])
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [devicesError, setDevicesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [created, setCreated] = useState<CreateApiKeyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      let list = await fetchMyOrgs()
      if (list.length === 0) {
        const ctx = await fetchOperatorContext()
        if (ctx?.defaultOrganizationId) {
          list = [
            {
              org_id: ctx.defaultOrganizationId,
              org_name: 'Workspace',
              role: 'owner',
            },
          ]
        }
      }
      setOrgs(list)
      if (list[0]) {
        setOrgId((prev) => prev || list[0].org_id)
      }
    })()
  }, [])

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true)
    try {
      const rt = await fetchRuntimes(orgId || undefined)
      setRuntimes(rt)
      setDevicesError(null)
    } catch (e) {
      setDevicesError(e instanceof Error ? e.message : 'Could not load connected devices')
    } finally {
      setDevicesLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void loadDevices()
    const id = setInterval(() => void loadDevices(), 8000)
    return () => clearInterval(id)
  }, [loadDevices])

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

  const onRotate = async (id: string) => {
    setRotatingId(id)
    setError(null)
    try {
      const row = await rotateApiKey(id)
      setCreated(row)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotate failed')
    } finally {
      setRotatingId(null)
    }
  }

  const onDelete = async (id: string) => {
    setConfirmDeleteId(null)
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
  const apiUrl = apiBaseUrl

  const envSnippet = created
    ? `SANCTUM_API_URL=${apiUrl}\nSANCTUM_API_KEY=${created.secret}${orgId ? `\nSANCTUM_ORG_ID=${orgId}` : ''}`
    : `SANCTUM_API_URL=${apiUrl}\nSANCTUM_API_KEY=sk_sanctum_...${orgId ? `\nSANCTUM_ORG_ID=${orgId}` : ''}`

  const workspaceOrgId = orgId || orgs[0]?.org_id || ''

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices & API keys</h1>
          <p>Connected runtimes, workspace credentials, and control-plane health</p>
        </div>
        <PageActions>
          {orgs.length > 1 ? (
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organization"
              style={{ minWidth: '10rem' }}
            >
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={devicesLoading}
            onClick={() => void loadDevices()}
          >
            <RefreshCw size={16} className={devicesLoading ? 'spin' : undefined} />
            Refresh
          </button>
        </PageActions>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <section className="section">
        <div className="section__header">
          <h2>
            <Monitor size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Connected devices
          </h2>
          <p>Runtimes registered via SDK connect — same hosts as Fleet</p>
        </div>

        <div className="section__body">
          {devicesError && (
            <Alert variant="error" onDismiss={() => setDevicesError(null)}>
              {devicesError}
            </Alert>
          )}
          {workspaceOrgId ? (
            <CopyField
              label="Workspace organization id"
              value={workspaceOrgId}
              hint="Set SANCTUM_ORG_ID when connecting scripts or marketplace examples."
            />
          ) : null}

          {devicesLoading && runtimes.length === 0 ? (
            <p className="hint-line" style={{ marginTop: workspaceOrgId ? '1rem' : 0 }}>
              Loading devices…
            </p>
          ) : runtimes.length === 0 ? (
            <EmptyState
              title="No devices connected yet"
              description="Create an API key below, set SANCTUM_API_URL and SANCTUM_ORG_ID, then run npm run example:connect or connectFromPackage() from the Marketplace."
            />
          ) : (
            <div className="policy-grid" style={{ marginTop: workspaceOrgId ? '1.25rem' : 0 }}>
              {runtimes.map((r) => (
                <article key={r.id} className="policy-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0 }}>{r.name}</h3>
                    <span className={`badge ${runtimeStatusBadge(r.status)}`}>{r.status}</span>
                  </div>
                  {r.active_model && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {r.active_model}
                    </p>
                  )}
                  {r.current_task && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                      {r.current_task}
                    </p>
                  )}
                  <DeviceDetails runtime={r} />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.73rem', color: 'var(--muted)' }}>
                    {r.last_seen_at ? timeAgo(r.last_seen_at) : 'never seen'} · <code style={{ fontFamily: 'monospace' }}>{r.id.slice(0, 8)}</code>
                  </p>
                </article>
              ))}
            </div>
          )}
          <p className="hint-line" style={{ marginTop: '1rem' }}>
            Map, agents, and dispatch live under <strong>Fleet</strong> in the sidebar.
          </p>
        </div>
      </section>

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
                        {confirmDeleteId === k.id ? (
                          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Delete key?</span>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                              disabled={deletingId != null}
                              onClick={() => void onDelete(k.id)}
                            >
                              Yes, delete
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy || deletingId != null || rotatingId != null}
                              onClick={() => void onRotate(k.id)}
                              aria-label={`Rotate API key ${k.name}`}
                              title="Generate a new secret for this key"
                            >
                              <RotateCcw size={14} />
                              {rotatingId === k.id ? 'Rotating…' : 'Rotate'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm key-delete-trigger"
                              disabled={busy || deletingId != null || rotatingId != null}
                              onClick={() => setConfirmDeleteId(k.id)}
                              aria-label={`Delete API key ${k.name}`}
                            >
                              <Trash2 size={15} />
                              {deletingId === k.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </span>
                        )}
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
