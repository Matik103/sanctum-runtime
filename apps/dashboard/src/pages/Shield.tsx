/**
 * Sanctum Shield — main status and containment control panel.
 *
 * Shows live Shield health, unresolved containment incidents, the fleet
 * kill switch, and links to the Shield Rules configuration page.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  OctagonX,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Zap,
} from 'lucide-react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { timeAgo } from '../lib/format'
import { getAccessToken } from '../lib/supabase'
import { formatApiError, responseError } from '../lib/sanitize-error'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { apiBaseUrl } from '../lib/api-url'

// Use the shared resolver (env var with a production fallback to
// api.sanctumruntime.com). A bare `?? ''` would fetch from the console origin
// when VITE_SANCTUM_API_URL is unset, silently breaking every Shield call.
const API_BASE = apiBaseUrl

type ShieldStatus = {
  fleetPaused: boolean
  fleetPausedAt: string | null
  fleetPausedBy: string | null
  unresolvedIncidents: number
}

type ContainmentEvent = {
  id: string
  actor: string
  action: string
  shield_level: 'elevated' | 'high' | 'critical'
  shield_score: number
  signals: string[]
  automatic_response: string[]
  resolved: boolean
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

const SIGNAL_LABELS: Record<string, string> = {
  security_control_tamper: 'Security tampering',
  physical_safety_emergency: 'Physical safety',
  critical_financial_exposure: 'Critical financial',
  repeated_blocked_attempts: 'Repeated blocks',
  secret_access_attempt: 'Secret access',
  untrusted_source_side_effect: 'Untrusted side effect',
  approval_fatigue_pattern: 'Approval fatigue',
  unknown_device_or_location: 'Unknown environment',
  unusual_time_access: 'Abnormal timing',
  owner_absent_or_sleeping: 'Owner vulnerable',
  suspicious_prompt_pattern: 'Prompt injection',
  unsafe_command_chain: 'Unsafe escalation',
  privilege_escalation_chain: 'Privilege escalation',
  high_value_transfer: 'High-value transfer',
  high_blast_radius: 'High blast radius',
  custom_shield_rule: 'Custom rule block',
}

function signalLabel(id: string): string {
  return SIGNAL_LABELS[id] ?? id.replace(/_/g, ' ')
}

function levelColor(level: string): string {
  if (level === 'critical') return 'var(--danger)'
  if (level === 'high') return 'var(--warning)'
  return 'var(--muted)'
}

type Props = {
  audit: ActionResult[]
  onPage: (page: import('../layout/Sidebar').PageId) => void
}

export function Shield({ audit, onPage }: Props) {
  const [status, setStatus] = useState<ShieldStatus | null>(null)
  const [events, setEvents] = useState<ContainmentEvent[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoadError(null)
    try {
      const headers = await authHeaders()
      const [statusRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/v1/shield/status`, { headers }),
        fetch(`${API_BASE}/v1/shield/containment?limit=20`, { headers }),
      ])
      if (statusRes.status === 402 || eventsRes.status === 402) {
        setLoadError('Shield requires Operator or higher. Upgrade on Billing to view containment.')
        return
      }
      if (statusRes.ok) setStatus(await statusRes.json() as ShieldStatus)
      else if (statusRes.status === 403) setLoadError('Insufficient permissions for Shield status.')
      if (eventsRes.ok) {
        const d = await eventsRes.json() as { events: ContainmentEvent[] }
        setEvents(d.events ?? [])
      }
    } catch {
      setLoadError('Could not load Shield status. Check API connection and retry.')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const toggleFleet = useCallback(async () => {
    if (!status) return
    if (!status.fleetPaused && !window.confirm('Pause the entire fleet? All agent approvals will be suspended org-wide until resumed.')) {
      return
    }
    setPauseLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const endpoint = status.fleetPaused ? '/v1/fleet/resume' : '/v1/fleet/pause'
      const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', headers, body: JSON.stringify({}) })
      if (!res.ok) throw await responseError(res, 'Could not update fleet status')
      await loadStatus()
    } catch (e) {
      setError(formatApiError(e, 'Could not update fleet status. Try again.'))
    } finally {
      setPauseLoading(false)
    }
  }, [status, loadStatus])

  const resolveEvent = useCallback(async (id: string) => {
    setResolving(id)
    setResolveError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_BASE}/v1/shield/containment/${id}/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ note: 'Reviewed and resolved by operator' }),
      })
      if (!res.ok) throw await responseError(res, 'Could not resolve the incident')
      setEvents((prev) => prev.map((e) => e.id === id ? { ...e, resolved: true, resolved_at: new Date().toISOString() } : e))
      if (status) setStatus({ ...status, unresolvedIncidents: Math.max(0, status.unresolvedIncidents - 1) })
    } catch (e) {
      setResolveError(formatApiError(e, 'Could not resolve incident. Try again.'))
    } finally {
      setResolving(null)
    }
  }, [status])

  // Derive metrics from in-memory audit log
  const shieldCritical = audit.filter((e) => e.shield?.level === 'critical').length
  const shieldHigh = audit.filter((e) => e.shield?.level === 'high').length
  const contained = audit.filter((e) => e.shield?.automaticResponse?.includes('block_action')).length
  const blocked24h = audit.filter((e) => e.decision === 'BLOCKED').length

  const shieldHealthy = !loadingStatus && !status?.fleetPaused && (status?.unresolvedIncidents ?? 0) === 0
  const shieldWarning = !loadingStatus && ((status?.unresolvedIncidents ?? 0) > 0)
  const shieldCriticalState = !loadingStatus && status?.fleetPaused

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Sanctum Shield</h1>
          <p>Early-warning behavioral detection, automatic containment, and runtime kill switch</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadStatus()}
            title="Refresh Shield status"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onPage('shield-rules')}
          >
            Configure Rules
          </button>
        </div>
      </header>

      {loadError && (
        <PlanGateAlert message={loadError} onDismiss={() => setLoadError(null)} style={{ marginBottom: '0.75rem' }} />
      )}

      {/* Shield health banner */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          borderColor: shieldCriticalState
            ? 'var(--danger)'
            : shieldWarning
              ? 'var(--warning)'
              : 'var(--success, #10b981)',
          background: shieldCriticalState
            ? 'rgba(239,68,68,0.06)'
            : shieldWarning
              ? 'rgba(245,158,11,0.06)'
              : 'rgba(16,185,129,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {shieldCriticalState ? (
            <OctagonX size={24} color="var(--danger)" />
          ) : shieldWarning ? (
            <ShieldAlert size={24} color="var(--warning)" />
          ) : (
            <ShieldCheck size={24} color="var(--success, #10b981)" />
          )}
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '1rem' }}>
              {shieldCriticalState
                ? 'Fleet paused — all actions are blocked'
                : shieldWarning
                  ? `Shield active — ${status?.unresolvedIncidents} unresolved incident${(status?.unresolvedIncidents ?? 0) !== 1 ? 's' : ''}`
                  : loadingStatus
                    ? 'Shield loading…'
                    : 'Shield active — no unresolved incidents'}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.83rem', color: 'var(--muted)' }}>
              {shieldCriticalState
                ? `Paused by ${status?.fleetPausedBy ?? 'operator'} at ${status?.fleetPausedAt ? timeAgo(status.fleetPausedAt) : 'unknown time'}. Resume to restore normal operations.`
                : 'Behavioral anomaly detection is monitoring every action in real time.'}
            </p>
          </div>
          {/* Fleet kill switch */}
          <button
            type="button"
            className={`btn ${status?.fleetPaused ? 'btn-success' : 'btn-danger'}`}
            onClick={() => void toggleFleet()}
            disabled={pauseLoading || loadingStatus}
            style={{ minWidth: 130, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Power size={15} />
            {pauseLoading ? 'Updating…' : status?.fleetPaused ? 'Resume Fleet' : 'Pause Fleet'}
          </button>
        </div>
        {error && <PlanGateAlert message={error} onDismiss={() => setError(null)} style={{ marginTop: '0.5rem' }} />}
      </div>

      {/* KPI strip */}
      <div className="stat-strip" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Critical incidents</p>
          <p className="stat-strip__value" style={{ color: shieldCritical > 0 ? 'var(--danger)' : undefined }}>
            {shieldCritical}
          </p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">High-risk held</p>
          <p className="stat-strip__value" style={{ color: shieldHigh > 0 ? 'var(--warning)' : undefined }}>
            {shieldHigh}
          </p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Auto-contained</p>
          <p className="stat-strip__value">{contained}</p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Blocked (session)</p>
          <p className="stat-strip__value">{blocked24h}</p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Unresolved</p>
          <p className="stat-strip__value" style={{ color: (status?.unresolvedIncidents ?? 0) > 0 ? 'var(--danger)' : undefined }}>
            {status?.unresolvedIncidents ?? '—'}
          </p>
        </div>
      </div>

      {/* Automatic containment capabilities */}
      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 className="card-label" style={{ marginBottom: '0.75rem' }}>Automatic containment responses</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {[
            { icon: OctagonX, label: 'Block execution', desc: 'Action denied before it runs', active: true },
            { icon: Siren, label: 'Alert operator', desc: 'Push + email sent immediately', active: true },
            { icon: Zap, label: 'Revoke grants', desc: 'Time-bounded permissions revoked', active: true },
            { icon: Power, label: 'Pause fleet', desc: 'All agents halted org-wide', active: !!status?.fleetPaused },
            { icon: ShieldAlert, label: 'Hold for review', desc: 'Human approval required', active: true },
            { icon: CheckCircle, label: 'Audit trail', desc: 'Every decision logged', active: true },
          ].map(({ icon: Icon, label, desc, active }) => (
            <div
              key={label}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: active ? 'rgba(16,185,129,0.04)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <Icon size={15} color={active ? 'var(--success, #10b981)' : 'var(--muted)'} />
                <strong style={{ fontSize: '0.82rem' }}>{label}</strong>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Containment event log */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h2 className="card-label">Recent containment events</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {events.filter((e) => !e.resolved).length} unresolved
          </span>
        </div>

        {resolveError && (
          <p style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }}>{resolveError}</p>
        )}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Action / Actor</th>
                <th>Threat level</th>
                <th>Signals detected</th>
                <th>Response</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    {loadingStatus ? 'Loading…' : 'No containment events recorded'}
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {event.action.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {event.actor}
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ color: levelColor(event.shield_level), border: `1px solid ${levelColor(event.shield_level)}44` }}
                      >
                        {event.shield_level} · {event.shield_score}/100
                      </span>
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {event.signals.slice(0, 3).map((s) => (
                          <span key={s} className="badge neutral" style={{ fontSize: '0.7rem' }}>
                            {signalLabel(s)}
                          </span>
                        ))}
                        {event.signals.length > 3 && (
                          <span className="badge neutral" style={{ fontSize: '0.7rem' }}>
                            +{event.signals.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {event.automatic_response.map((r) => (
                        <span key={r} className="badge danger" style={{ fontSize: '0.72rem', marginRight: '0.25rem' }}>
                          {r.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.8rem' }}>
                      {timeAgo(event.created_at)}
                    </td>
                    <td>
                      {event.resolved ? (
                        <span className="badge success" style={{ fontSize: '0.72rem' }}>
                          <CheckCircle size={11} style={{ marginRight: 3 }} />
                          Resolved
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          disabled={resolving === event.id}
                          onClick={() => void resolveEvent(event.id)}
                        >
                          {resolving === event.id ? 'Resolving…' : 'Resolve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* What Shield detects */}
      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="card-label" style={{ marginBottom: '0.75rem' }}>What Shield monitors</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '0.5rem',
            fontSize: '0.82rem',
          }}
        >
          {[
            'Repeated failed approvals',
            'Unusual action timing',
            'New device or unknown location',
            'Sudden permission escalation',
            'Abnormal API call patterns',
            'Prompt injection attempts',
            'Unexpected file deletion',
            'High-value financial transfers',
            'Attempts to disable security controls',
            'Agent reading secrets or credentials',
            'Physical actions in unsafe contexts',
            'Rapid repeat requests (rate flooding)',
          ].map((item) => (
            <div
              key={item}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.4rem',
                color: 'var(--muted)',
              }}
            >
              <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0, color: 'var(--warning)' }} />
              {item}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
