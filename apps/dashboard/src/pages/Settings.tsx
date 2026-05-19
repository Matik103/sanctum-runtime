import { useEffect, useState } from 'react'
import { BarChart3, Bell, Download, Settings2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { Alert } from '../components/ui/Alert'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'
import { fetchOperatorContext } from '../lib/marketplace'
import { riskModelMetaLine } from '../lib/risk-label'
import { fetchUsage, usageMetricLabel, type UsageSummary } from '../lib/usage'
import { apiBaseUrl as apiBase } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

type NotificationPrefs = {
  notification_email: string | null
  slack_webhook_url: string | null
  notification_webhook_url: string | null
  quota_warning_pct: number
}

type Props = { status: RuntimeStatus | null }

export function Settings({ status }: Props) {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [, setNotifPrefs] = useState<NotificationPrefs | null>(null)
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifMsg, setNotifMsg] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editSlack, setEditSlack] = useState('')
  const [editWebhook, setEditWebhook] = useState('')
  const [editPct, setEditPct] = useState(80)

  useEffect(() => {
    void (async () => {
      let list = await fetchMyOrgs()
      if (list.length === 0) {
        const ctx = await fetchOperatorContext()
        if (ctx?.defaultOrganizationId) {
          list = [{ org_id: ctx.defaultOrganizationId, org_name: 'Workspace', role: 'owner' }]
        }
      }
      setOrgs(list)
      if (list[0]) setOrgId(list[0].org_id)
    })()
  }, [])

  useEffect(() => {
    if (!orgId) return
    void fetchUsage(orgId, 30)
      .then(setUsage)
      .catch((e) => setUsageError(e instanceof Error ? e.message : 'Usage unavailable'))

    void (async () => {
      try {
        const headers = await authHeaders()
        const res = await fetch(`${apiBase}/v1/orgs/${orgId}/notifications`, { headers })
        if (!res.ok) return
        const d = await res.json() as NotificationPrefs
        setNotifPrefs(d)
        setEditEmail(d.notification_email ?? '')
        setEditSlack(d.slack_webhook_url ?? '')
        setEditWebhook(d.notification_webhook_url ?? '')
        setEditPct(d.quota_warning_pct ?? 80)
      } catch { /* ignore if not configured */ }
    })()
  }, [orgId])

  const handleExport = async () => {
    setExportBusy(true)
    setExportMsg(null)
    try {
      const res = await fetch(`${apiBase}/v1/orgs/${orgId}/export.json`, { headers: await authHeaders() })
      if (res.status === 429) {
        const body = await res.json() as { retryAfterMinutes?: number }
        setExportMsg(`Rate limited — next export available in ${body.retryAfterMinutes ?? 60} minutes.`)
        return
      }
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().slice(0, 10)
      a.download = `sanctum-export-${orgId}-${today}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg('Export downloaded successfully.')
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  const saveNotifPrefs = async () => {
    setNotifBusy(true)
    setNotifMsg(null)
    try {
      const res = await fetch(`${apiBase}/v1/orgs/${orgId}/notifications`, {
        method: 'PATCH',
        headers: await authHeaders(true),
        body: JSON.stringify({
          notification_email: editEmail || null,
          slack_webhook_url: editSlack || null,
          notification_webhook_url: editWebhook || null,
          quota_warning_pct: editPct,
        }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      setNotifMsg('Notification preferences saved.')
    } catch (e) {
      setNotifMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setNotifBusy(false)
    }
  }

  const operational = status?.runtimeOnline !== false
  const provider = status?.riskProvider ?? (status?.ollamaConnected ? 'ollama' : 'none')
  const modelReady = status?.riskModelConnected ?? status?.ollamaConnected ?? false

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Runtime configuration, alerts, and data export</p>
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

      {orgs.length > 0 && (
        <>
          <section className="section">
            <div className="section__header">
              <h2>
                <Bell size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                Notifications
              </h2>
              <p>Alerts for quota warnings, anomaly spikes, and runtime events</p>
            </div>
            <div className="section__body">
              {notifMsg && (
                <Alert variant={notifMsg.includes('saved') ? 'success' : 'error'} onDismiss={() => setNotifMsg(null)}>
                  {notifMsg}
                </Alert>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '28rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    Alert email
                  </label>
                  <input
                    className="input"
                    type="email"
                    placeholder="ops@yourcompany.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    Slack webhook URL
                  </label>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://hooks.slack.com/services/..."
                    value={editSlack}
                    onChange={(e) => setEditSlack(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    Generic webhook URL (PagerDuty, OpsGenie…)
                  </label>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://events.pagerduty.com/..."
                    value={editWebhook}
                    onChange={(e) => setEditWebhook(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    Quota warning threshold: <strong>{editPct}%</strong>
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={editPct}
                    onChange={(e) => setEditPct(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={notifBusy || !orgId}
                  onClick={() => void saveNotifPrefs()}
                  style={{ width: 'fit-content' }}
                >
                  {notifBusy ? 'Saving…' : 'Save notification settings'}
                </button>
              </div>
              <p className="hint-line" style={{ marginTop: '0.75rem' }}>
                Email alerts require an active email integration on your deployment.
              </p>
            </div>
          </section>

          <section className="section">
            <div className="section__header">
              <h2>
                <Download size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                Data export (GDPR)
              </h2>
              <p>Download all org data — audit events, runtimes, API key metadata, usage events</p>
            </div>
            <div className="section__body">
              {exportMsg && (
                <Alert
                  variant={exportMsg.includes('Rate limited') ? 'warn' : exportMsg.includes('success') ? 'success' : 'error'}
                  onDismiss={() => setExportMsg(null)}
                >
                  {exportMsg}
                </Alert>
              )}
              {orgs.length > 1 && (
                <select
                  className="input"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  style={{ marginBottom: '1rem', maxWidth: '16rem' }}
                >
                  {orgs.map((o) => (
                    <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
                  ))}
                </select>
              )}
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                Exports a JSON file containing all data associated with org <code className="inline-code">{orgId}</code>.
                Rate limited to one export per hour. Export history is logged for GDPR compliance.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={exportBusy || !orgId}
                onClick={() => void handleExport()}
              >
                <Download size={15} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                {exportBusy ? 'Preparing export…' : 'Download org data'}
              </button>
            </div>
          </section>

          <section className="section">
            <div className="section__header">
              <h2>
                <BarChart3 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                Usage (30 days)
              </h2>
              <p>Control-plane metering — see Billing for quota details</p>
            </div>
            <div className="section__body">
              {orgs.length > 1 && (
                <select
                  className="input"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  style={{ marginBottom: '1rem', maxWidth: '16rem' }}
                >
                  {orgs.map((o) => (
                    <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
                  ))}
                </select>
              )}
              {usageError && (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{usageError}</p>
              )}
              {usage && Object.keys(usage.totals).length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  No usage recorded yet — connect a runtime or verify an action.
                </p>
              )}
              {usage && Object.keys(usage.totals).length > 0 && (
                <div className="stat-strip">
                  {Object.entries(usage.totals)
                    .sort(([, a], [, b]) => b - a)
                    .map(([metric, total]) => (
                      <div key={metric} className="stat-strip__item">
                        <p className="stat-strip__label">{usageMetricLabel(metric)}</p>
                        <p className="stat-strip__value">{Math.round(total)}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  )
}
