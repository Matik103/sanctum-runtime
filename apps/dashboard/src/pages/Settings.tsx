import { useEffect, useState } from 'react'
import { BarChart3, Bell, Download, Settings2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { Alert } from '../components/ui/Alert'
import { AIModelCard } from '../components/AIModelCard'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'
import { fetchOperatorContext } from '../lib/marketplace'
import { riskModelMetaLine } from '../lib/risk-label'
import { fetchUsage, usageMetricLabel, type UsageSummary } from '../lib/usage'
import { apiBaseUrl as apiBase } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { usePushNotifications } from '../hooks/usePushNotifications'

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

type NotificationPrefs = {
  notification_email: string | null
  slack_webhook_configured: boolean
  notification_webhook_configured: boolean
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
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null)
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
        // Never pre-populate webhook inputs — show configured status instead
        setEditSlack('')
        setEditWebhook('')
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
      if (!res.ok) {
        let detail = `Export failed (${res.status})`
        try {
          const body = (await res.json()) as { detail?: string; hint?: string; error?: string }
          if (body.hint) detail = body.hint
          else if (body.detail) detail = body.detail
          else if (body.error) detail = body.error.replace(/_/g, ' ')
        } catch {
          /* non-JSON */
        }
        throw new Error(detail)
      }
      const text = await res.text()
      let warnNote = ''
      try {
        const parsed = JSON.parse(text) as { warnings?: string[] }
        if (parsed.warnings?.length) {
          warnNote = ` Some sections were empty (${parsed.warnings.length} query warning(s) — see file).`
        }
      } catch {
        /* ignore */
      }
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().slice(0, 10)
      a.download = `sanctum-export-${orgId}-${today}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg(`Export downloaded successfully.${warnNote}`)
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  const clearWebhook = async (field: 'slack_webhook_url' | 'notification_webhook_url') => {
    if (!orgId) return
    try {
      const res = await fetch(`${apiBase}/v1/orgs/${orgId}/notifications`, {
        method: 'PATCH',
        headers: await authHeaders(true),
        body: JSON.stringify({ [field]: null }),
      })
      if (!res.ok) throw new Error(`Clear failed: ${res.status}`)
      const updated = await res.json() as NotificationPrefs
      setNotifPrefs(updated)
    } catch (e) {
      setNotifMsg(e instanceof Error ? e.message : 'Clear failed')
    }
  }

  const saveNotifPrefs = async () => {
    setNotifBusy(true)
    setNotifMsg(null)
    try {
      const patch: Record<string, unknown> = {
        notification_email: editEmail || null,
        quota_warning_pct: editPct,
      }
      // Only include webhook URLs when the user typed a new value.
      // Omitting the key preserves the existing stored value.
      // Sending null explicitly clears it.
      if (editSlack) patch.slack_webhook_url = editSlack
      if (editWebhook) patch.notification_webhook_url = editWebhook

      const res = await fetch(`${apiBase}/v1/orgs/${orgId}/notifications`, {
        method: 'PATCH',
        headers: await authHeaders(true),
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      const updated = await res.json() as NotificationPrefs
      setNotifPrefs(updated)
      setEditSlack('')
      setEditWebhook('')
      setNotifMsg('Notification preferences saved.')
    } catch (e) {
      setNotifMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setNotifBusy(false)
    }
  }

  const {
    state: pushState,
    error: pushError,
    deviceCount: pushDeviceCount,
    testBusy: pushTestBusy,
    testMessage: pushTestMessage,
    refreshEnvironment: refreshPushEnvironment,
    subscribe: enablePush,
    unsubscribe: disablePush,
    sendTest: sendPushTest,
  } = usePushNotifications()
  const [pushBusy, setPushBusy] = useState(false)

  const handlePushToggle = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'subscribed') {
        await disablePush()
      } else {
        await enablePush()
      }
    } finally {
      setPushBusy(false)
    }
  }

  const operational = status?.runtimeOnline !== false

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

      <AIModelCard status={status} />

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
                <Alert variant={notifMsg.includes('saved') || notifMsg.includes('removed') ? 'success' : 'error'} onDismiss={() => setNotifMsg(null)}>
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
                  {notifPrefs?.slack_webhook_configured && !editSlack && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span className="badge success" style={{ fontSize: '0.72rem' }}>Configured</span>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', color: 'var(--danger)' }} onClick={() => void clearWebhook('slack_webhook_url')}>
                        Remove
                      </button>
                    </div>
                  )}
                  <input
                    className="input"
                    type="url"
                    placeholder={notifPrefs?.slack_webhook_configured ? 'Enter new URL to replace…' : 'https://hooks.slack.com/services/...'}
                    value={editSlack}
                    onChange={(e) => setEditSlack(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--muted)' }}>
                    Generic webhook URL (PagerDuty, OpsGenie…)
                  </label>
                  {notifPrefs?.notification_webhook_configured && !editWebhook && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span className="badge success" style={{ fontSize: '0.72rem' }}>Configured</span>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', color: 'var(--danger)' }} onClick={() => void clearWebhook('notification_webhook_url')}>
                        Remove
                      </button>
                    </div>
                  )}
                  <input
                    className="input"
                    type="url"
                    placeholder={notifPrefs?.notification_webhook_configured ? 'Enter new URL to replace…' : 'https://events.pagerduty.com/...'}
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
              <div className="settings-push">
                <div className="settings-push__copy">
                  <p className="settings-push__title">Mobile push</p>
                  <p className="settings-push__detail">Approval and incident alerts on this device</p>
                  {pushState === 'unavailable' && !pushError && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      Push delivery is not configured on this deployment. Ask your administrator to set
                      <code style={{ margin: '0 0.25rem' }}>VAPID_PUBLIC_KEY</code>
                      and
                      <code style={{ margin: '0 0.25rem' }}>VAPID_PRIVATE_KEY</code>
                      on the API service.
                    </p>
                  )}
                  {pushState === 'denied' && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      Notifications are blocked. Allow alerts for Sanctum in your device or browser notification
                      settings, then return to this page.
                    </p>
                  )}
                  {pushState === 'ios_install_required' && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      iOS only delivers web push to installed apps. Tap the <strong>Share</strong> icon in Safari,
                      choose <strong>Add to Home Screen</strong>, then open Sanctum from the new icon and reload this page.
                    </p>
                  )}
                  {pushState === 'ios_upgrade_required' && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      Web push on iOS requires iOS 16.4 or later. Update your device in
                      <strong> Settings → General → Software Update</strong>, then reopen Sanctum from the home screen.
                    </p>
                  )}
                  {pushState === 'ios_push_unavailable' && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      iOS is not exposing Web Push to this installed app yet. Open Sanctum from the Home Screen icon
                      added through Safari, then tap <strong>Check again</strong>. If this keeps happening, remove the
                      Home Screen app and add it again from Safari so iOS refreshes the manifest and service worker.
                    </p>
                  )}
                  {pushState === 'unsupported' && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      This browser does not support web push notifications. Try Safari (iOS) or Chrome / Edge (desktop / Android).
                    </p>
                  )}
                  {pushError && <p className="settings-push__error">{pushError}</p>}
                  {pushState === 'subscribed' && pushDeviceCount !== null && (
                    <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>
                      {pushDeviceCount} subscribed device{pushDeviceCount === 1 ? '' : 's'} ready for delivery.
                    </p>
                  )}
                  {pushTestMessage && <p className="settings-push__detail" style={{ marginTop: '0.35rem' }}>{pushTestMessage}</p>}
                </div>
                <span className={`badge ${
                  pushState === 'subscribed' ? 'success'
                  : pushState === 'denied' || pushState === 'unavailable' || pushState === 'ios_upgrade_required' || pushState === 'ios_push_unavailable' ? 'warning'
                  : 'neutral'
                }`}>
                  {pushState === 'subscribed' ? 'Enabled'
                    : pushState === 'checking' ? 'Checking'
                    : pushState === 'subscribing' ? 'Enabling'
                    : pushState === 'denied' ? 'Blocked'
                    : pushState === 'unavailable' ? 'Not configured'
                    : pushState === 'ios_install_required' ? 'Add to Home Screen'
                    : pushState === 'ios_upgrade_required' ? 'Update iOS'
                    : pushState === 'ios_push_unavailable' ? 'Unavailable'
                    : pushState === 'unsupported' ? 'Unsupported'
                    : 'Off'}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={
                    pushBusy
                    || pushState === 'checking'
                    || pushState === 'subscribing'
                    || pushState === 'unsupported'
                    || pushState === 'denied'
                    || pushState === 'unavailable'
                    || pushState === 'ios_install_required'
                    || pushState === 'ios_upgrade_required'
                    || pushState === 'ios_push_unavailable'
                  }
                  onClick={() => void handlePushToggle()}
                >
                  {pushBusy || pushState === 'subscribing' ? 'Updating...' : pushState === 'subscribed' ? 'Disable' : 'Enable'}
                </button>
                {(pushState === 'ios_install_required' || pushState === 'ios_upgrade_required' || pushState === 'ios_push_unavailable' || pushState === 'unsupported') && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={refreshPushEnvironment}
                  >
                    Check again
                  </button>
                )}
                {pushState === 'subscribed' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pushTestBusy}
                    onClick={() => void sendPushTest()}
                  >
                    {pushTestBusy ? 'Sending...' : 'Send test'}
                  </button>
                )}
              </div>
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
