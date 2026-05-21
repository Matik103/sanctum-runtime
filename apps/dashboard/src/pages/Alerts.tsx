import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Plus,
  Settings2,
  Trash2,
  Zap,
} from 'lucide-react'
import type { PageId } from '../layout/Sidebar'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { Alert } from '../components/ui/Alert'
import { TabBar } from '../components/ui/TabBar'
import { timeAgo } from '../lib/format'
import { fetchMyOrgs } from '../lib/fleet'

type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency'
type AlertStatus = 'open' | 'acknowledged' | 'resolved'

type AlertRecord = {
  id: string
  org_id: string
  runtime_id: string | null
  severity: AlertSeverity
  type: string
  title: string
  message: string
  status: AlertStatus
  channels: string[]
  metadata: Record<string, unknown>
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

type AlertRule = {
  id: string
  org_id: string
  name: string
  event_type: string
  threshold: number
  window_minutes: number
  severity: AlertSeverity
  channels: string[]
  is_active: boolean
  created_at: string
}

type Stats = { open: number; acknowledged: number; critical: number; emergency: number }

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

const SEVERITY_META: Record<AlertSeverity, { label: string; color: string; bg: string }> = {
  info:      { label: 'Info',      color: '#3b82f6', bg: '#1d3461' },
  warning:   { label: 'Warning',   color: '#f59e0b', bg: '#3d2a06' },
  critical:  { label: 'Critical',  color: '#ef4444', bg: '#3d0a0a' },
  emergency: { label: 'Emergency', color: '#dc2626', bg: '#450a0a' },
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const m = SEVERITY_META[severity]
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.7rem',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 4,
      background: m.bg,
      color: m.color,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      {m.label}
    </span>
  )
}

function StatusIcon({ status }: { status: AlertStatus }) {
  if (status === 'resolved')     return <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
  if (status === 'acknowledged') return <Clock size={14} style={{ color: 'var(--warn, #f59e0b)' }} />
  return <Circle size={14} style={{ color: 'var(--danger)' }} />
}

const EVENT_TYPES = [
  'anomaly.spike',
  'agent.blocked_action',
  'agent.policy_violation',
  'agent.loop_detected',
  'runtime.offline',
  'runtime.extended_offline',
  'runtime.tampered',
  'runtime.attestation_failed',
  'security.attestation_failed',
  'security.unauthorized_access',
  'quota.warning',
  'quota.exceeded',
  'billing.payment_failed',
]

export function Alerts({ onPage }: { onPage?: (p: PageId) => void }) {
  const [orgId, setOrgId] = useState('')
  const [tab, setTab] = useState<'incidents' | 'rules'>('incidents')
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('open')
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all')
  const [incidents, setIncidents] = useState<AlertRecord[]>([])
  const [rules, setRules] = useState<AlertRule[]>([])
  const [stats, setStats] = useState<Stats>({ open: 0, acknowledged: 0, critical: 0, emergency: 0 })
  const [selected, setSelected] = useState<AlertRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [showNewRule, setShowNewRule] = useState(false)
  const [newRule, setNewRule] = useState({
    name: '',
    event_type: 'anomaly.spike',
    threshold: 1,
    window_minutes: 60,
    severity: 'critical' as AlertSeverity,
    channels: ['email'] as string[],
  })

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  const loadIncidents = async () => {
    if (!orgId) return
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (severityFilter !== 'all') params.set('severity', severityFilter)
    params.set('limit', '200')
    const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alerts?${params}`, {
      headers: await authHeaders(),
    })
    if (res.ok) {
      const d = await res.json() as { alerts: AlertRecord[] }
      setIncidents(d.alerts)
    }
  }

  const loadStats = async () => {
    if (!orgId) return
    const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alerts/stats`, {
      headers: await authHeaders(),
    })
    if (res.ok) setStats(await res.json() as Stats)
  }

  const loadRules = async () => {
    if (!orgId) return
    const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alert-rules`, {
      headers: await authHeaders(),
    })
    if (res.ok) {
      const d = await res.json() as { rules: AlertRule[] }
      setRules(d.rules)
    }
  }

  useEffect(() => {
    void loadIncidents()
    void loadStats()
    void loadRules()
  }, [orgId, statusFilter, severityFilter])

  const acknowledge = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alerts/${id}/acknowledge`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setMsg({ text: 'Alert acknowledged.', variant: 'success' })
      if (selected?.id === id) setSelected(null)
      await loadIncidents()
      await loadStats()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const resolve = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alerts/${id}/resolve`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setMsg({ text: 'Alert resolved.', variant: 'success' })
      if (selected?.id === id) setSelected(null)
      await loadIncidents()
      await loadStats()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const createRule = async () => {
    if (!newRule.name || !orgId) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alert-rules`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify(newRule),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setMsg({ text: 'Alert rule created.', variant: 'success' })
      setShowNewRule(false)
      setNewRule({ name: '', event_type: 'anomaly.spike', threshold: 1, window_minutes: 60, severity: 'critical', channels: ['email'] })
      await loadRules()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const toggleRule = async (rule: AlertRule) => {
    await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alert-rules/${rule.id}`, {
      method: 'PATCH',
      headers: await authHeaders(true),
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    await loadRules()
  }

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Delete this alert rule?')) return
    await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/alert-rules/${ruleId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    await loadRules()
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Runtime incident management — anomalies, policy violations, and infrastructure events</p>
        </div>
      </header>

      {/* Stats strip */}
      <div className="stat-strip" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Open</p>
          <p className="stat-strip__value" style={{ color: stats.open > 0 ? 'var(--danger)' : undefined }}>
            {stats.open}
          </p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Acknowledged</p>
          <p className="stat-strip__value">{stats.acknowledged}</p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Critical (active)</p>
          <p className="stat-strip__value" style={{ color: stats.critical > 0 ? '#ef4444' : undefined }}>
            {stats.critical}
          </p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Emergency (active)</p>
          <p className="stat-strip__value" style={{ color: stats.emergency > 0 ? '#dc2626' : undefined }}>
            {stats.emergency}
          </p>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: '1rem' }}>
          <Alert variant={msg.variant} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Alert>
        </div>
      )}

      <TabBar
        tabs={[
          { id: 'incidents' as const, label: 'Incidents' },
          { id: 'rules' as const, label: 'Alert Rules' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── Incidents tab ─────────────────────────────────────────────────── */}
      {tab === 'incidents' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(['all', 'open', 'acknowledged', 'resolved'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${statusFilter === s ? ' chip--active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span style={{ borderLeft: '1px solid var(--border)', margin: '0 0.25rem' }} />
            {(['all', 'emergency', 'critical', 'warning', 'info'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${severityFilter === s ? ' chip--active' : ''}`}
                onClick={() => setSeverityFilter(s)}
              >
                {s === 'all' ? 'All severities' : SEVERITY_META[s]?.label ?? s}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th></th>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Type</th>
                    <th>Age</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">
                        {statusFilter === 'open'
                          ? 'No open incidents — your fleet is healthy'
                          : 'No incidents match the current filters'}
                      </td>
                    </tr>
                  ) : incidents.map((inc) => (
                    <tr
                      key={inc.id}
                      className="feed-row"
                      style={{ background: selected?.id === inc.id ? 'var(--surface-raised)' : undefined }}
                      onClick={() => setSelected(selected?.id === inc.id ? null : inc)}
                    >
                      <td style={{ width: 20 }}>
                        <StatusIcon status={inc.status} />
                      </td>
                      <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{inc.title}</td>
                      <td><SeverityBadge severity={inc.severity} /></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                        {inc.type}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{timeAgo(inc.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {inc.status === 'open' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => void acknowledge(inc.id)}
                              title="Acknowledge"
                            >
                              <Clock size={12} />
                            </button>
                          )}
                          {inc.status !== 'resolved' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={busy}
                              onClick={() => void resolve(inc.id)}
                              title="Resolve"
                            >
                              <CheckCircle2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <SeverityBadge severity={selected.severity} />
                    <h3 style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.95rem', fontWeight: 600 }}>
                      {selected.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                      {selected.type}
                    </p>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {selected.message}
                </p>

                <dl className="detail-list" style={{ marginBottom: '1rem' }}>
                  <div><dt>Status</dt><dd>{selected.status}</dd></div>
                  <div><dt>Created</dt><dd>{timeAgo(selected.created_at)}</dd></div>
                  {selected.acknowledged_at && (
                    <div><dt>Acknowledged</dt><dd>{timeAgo(selected.acknowledged_at)} by {selected.acknowledged_by}</dd></div>
                  )}
                  {selected.resolved_at && (
                    <div><dt>Resolved</dt><dd>{timeAgo(selected.resolved_at)} by {selected.resolved_by}</dd></div>
                  )}
                  {selected.runtime_id && <div><dt>Runtime</dt><dd style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>{selected.runtime_id}</dd></div>}
                </dl>

                {Object.keys(selected.metadata).length > 0 && (
                  <>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.4rem', fontWeight: 500 }}>Metadata</p>
                    <pre style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-raised)', padding: '0.75rem', borderRadius: 6 }}>
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </>
                )}

                {selected.status !== 'resolved' && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    {selected.status === 'open' && (
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void acknowledge(selected.id)}>
                        <Clock size={12} style={{ marginRight: '0.3rem' }} />
                        Acknowledge
                      </button>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void resolve(selected.id)}>
                      <CheckCircle2 size={12} style={{ marginRight: '0.3rem' }} />
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Rules tab ─────────────────────────────────────────────────────── */}
      {tab === 'rules' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowNewRule(true)}>
              <Plus size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
              New rule
            </button>
          </div>

          {showNewRule && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>
                <Settings2 size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                New alert rule
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '36rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Rule name</label>
                  <input className="input" placeholder="e.g. Block spike alert" value={newRule.name}
                    onChange={(e) => setNewRule(r => ({ ...r, name: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Event type</label>
                  <select className="input" value={newRule.event_type}
                    onChange={(e) => setNewRule(r => ({ ...r, event_type: e.target.value }))} style={{ width: '100%' }}>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Severity</label>
                  <select className="input" value={newRule.severity}
                    onChange={(e) => setNewRule(r => ({ ...r, severity: e.target.value as AlertSeverity }))} style={{ width: '100%' }}>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Threshold (occurrences)</label>
                  <input className="input" type="number" min={1} max={1000} value={newRule.threshold}
                    onChange={(e) => setNewRule(r => ({ ...r, threshold: Number(e.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Window (minutes)</label>
                  <input className="input" type="number" min={1} max={10080} value={newRule.window_minutes}
                    onChange={(e) => setNewRule(r => ({ ...r, window_minutes: Number(e.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Notification channels</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['email', 'slack', 'webhook', 'dashboard'] as const).map((ch) => (
                      <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newRule.channels.includes(ch)}
                          onChange={(e) => setNewRule(r => ({
                            ...r,
                            channels: e.target.checked
                              ? [...r.channels, ch]
                              : r.channels.filter(c => c !== ch),
                          }))}
                        />
                        {ch}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" disabled={busy || !newRule.name} onClick={() => void createRule()}>
                  {busy ? 'Creating…' : 'Create rule'}
                </button>
                <button type="button" className="btn" onClick={() => setShowNewRule(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Event type</th>
                  <th>Threshold</th>
                  <th>Severity</th>
                  <th>Channels</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      No alert rules configured — create one to get notified when events exceed thresholds
                    </td>
                  </tr>
                ) : rules.map((rule) => (
                  <tr key={rule.id}>
                    <td style={{ fontWeight: 500, fontSize: '0.85rem' }}>{rule.name}</td>
                    <td style={{ fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace', color: 'var(--muted)' }}>
                      {rule.event_type}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {rule.threshold}× / {rule.window_minutes}min
                    </td>
                    <td><SeverityBadge severity={rule.severity} /></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      {rule.channels.join(', ')}
                    </td>
                    <td>
                      <span className={`badge ${rule.is_active ? 'success' : 'neutral'}`}>
                        {rule.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          title={rule.is_active ? 'Pause rule' : 'Activate rule'}
                          onClick={() => void toggleRule(rule)}
                        >
                          {rule.is_active ? <Zap size={12} /> : <Bell size={12} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          title="Delete rule"
                          onClick={() => void deleteRule(rule.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
          <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem', color: 'var(--warn, #f59e0b)' }} />
          Alerts are sent via <strong>alerts@sanctumruntime.com</strong>. Configure delivery channels in{' '}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', padding: 0, display: 'inline', color: 'var(--primary)' }}
            onClick={() => onPage?.('settings')}
          >
            Settings → Notifications
            <ExternalLink size={11} style={{ marginLeft: '0.25rem', verticalAlign: 'middle' }} />
          </button>.
        </p>
      </div>
    </>
  )
}
