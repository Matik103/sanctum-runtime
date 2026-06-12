import { useState } from 'react'
import { OctagonX, ShieldAlert, Siren } from 'lucide-react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { decisionTone, timeAgo } from '../lib/format'
import {
  actionLabel,
  actorLabel,
  anomalyLabel,
  decisionLabel,
  riskLabel,
} from '../lib/labels'

const THREAT_TYPES = [
  { id: 'security_control_tamper', label: 'Security tampering', severity: 'critical' },
  { id: 'physical_safety_emergency', label: 'Physical safety', severity: 'critical' },
  { id: 'critical_financial_exposure', label: 'Critical financial', severity: 'critical' },
  { id: 'repeated_blocked_attempts', label: 'Repeated blocked', severity: 'critical' },
  { id: 'secret_access_attempt', label: 'Secret access', severity: 'high' },
  { id: 'untrusted_source_side_effect', label: 'Untrusted side effect', severity: 'high' },
  { id: 'high_blast_radius', label: 'High blast radius', severity: 'high' },
  { id: 'approval_fatigue_pattern', label: 'Approval fatigue', severity: 'high' },
  { id: 'unusual_time_access', label: 'Abnormal timing', severity: 'medium' },
  { id: 'unknown_device_or_location', label: 'Unknown environment', severity: 'medium' },
  { id: 'owner_absent_or_sleeping', label: 'Owner vulnerable', severity: 'high' },
  { id: 'suspicious_prompt_pattern', label: 'Prompt injection', severity: 'high' },
  { id: 'unsafe_command_chain', label: 'Unsafe escalation', severity: 'high' },
  { id: 'rapid_repeat_action', label: 'Rapid repeat', severity: 'medium' },
  { id: 'privilege_escalation_chain', label: 'Privilege escalation', severity: 'high' },
  { id: 'high_value_transfer', label: 'High-value transfer', severity: 'high' },
] as const

type Severity = 'critical' | 'high' | 'medium'

// Per-anomaly-flag severity, derived from the THREAT_TYPES catalog above.
const FLAG_SEVERITY: Record<string, Severity> = Object.fromEntries(
  THREAT_TYPES.map((t) => [t.id, t.severity as Severity]),
)

const SEVERITY_RANK: Record<Severity, number> = { medium: 1, high: 2, critical: 3 }

/**
 * Highest severity for an event, considering BOTH the Shield assessment level
 * and any anomaly flags. Returns null when the event carries no threat signal.
 * Keeps the severity filter and the per-type counts consistent (previously the
 * "Critical" filter only looked at shield.level and silently dropped
 * critical-severity anomaly flags like repeated_blocked_attempts).
 */
function eventSeverity(e: ActionResult): Severity | null {
  let rank = 0
  const bump = (s: Severity) => { if (SEVERITY_RANK[s] > rank) rank = SEVERITY_RANK[s] }

  if (e.shield?.level === 'critical') bump('critical')
  else if (e.shield?.level === 'high') bump('high')
  else if (e.shield?.level === 'elevated') bump('medium')

  for (const f of e.anomalyFlags) {
    const s = FLAG_SEVERITY[f]
    if (s) bump(s)
  }

  if (rank === 3) return 'critical'
  if (rank === 2) return 'high'
  if (rank === 1) return 'medium'
  return null
}

type Props = { audit: ActionResult[]; onSelect: (e: ActionResult) => void }

export function ThreatMonitor({ audit, onSelect }: Props) {
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all')
  const [threatTypeFilter, setThreatTypeFilter] = useState<string | null>(null)

  const withAnomalies = audit.filter((e) => e.anomalyFlags.length > 0)
  const blocked = audit.filter((e) => e.decision === 'BLOCKED')
  const held = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION')
  const shieldIncidents = audit.filter((e) => e.shield && e.shield.level !== 'clear')
  const shieldCritical = audit.filter((e) => e.shield?.level === 'critical')
  const contained = audit.filter((e) => e.shield?.automaticResponse.includes('block_action'))

  const threats = audit.filter(
    (e) => e.decision !== 'APPROVED' || e.anomalyFlags.length > 0,
  )

  const filtered = threats.filter((e) => {
    if (severityFilter !== 'all' && eventSeverity(e) !== severityFilter) return false
    if (threatTypeFilter && !e.anomalyFlags.includes(threatTypeFilter)) return false
    return true
  })

  // Real trailing-24h histogram: 24 one-hour buckets ending at the current hour.
  // (Previously this grouped events by hour-of-day across the entire log and
  // labelled it "24h", and added a phantom +4 baseline to empty hours.)
  const hourMs = 3_600_000
  const nowMs = Date.now()
  const hourlyCounts = Array.from({ length: 24 }, (_, i) => {
    const bucketEnd = nowMs - (23 - i) * hourMs
    const bucketStart = bucketEnd - hourMs
    return threats.filter((e) => {
      const t = new Date(e.timestamp).getTime()
      return Number.isFinite(t) && t > bucketStart && t <= bucketEnd
    }).length
  })
  const maxHourly = Math.max(1, ...hourlyCounts)
  const threats24h = hourlyCounts.reduce((sum, n) => sum + n, 0)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Threat Monitor</h1>
          <p>Sanctum Shield early-warning detection and automatic containment</p>
        </div>
      </header>

      <section className="shield-overview" aria-label="Sanctum Shield status">
        <div className="shield-overview__identity">
          <ShieldAlert size={22} />
          <div>
            <h2>Shield active</h2>
            <p>Critical behavior is blocked before execution and surfaced for operator review.</p>
          </div>
        </div>
        <div className="shield-overview__metrics">
          <div>
            <Siren size={16} />
            <strong>{shieldCritical.length}</strong>
            <span>Critical incidents</span>
          </div>
          <div>
            <OctagonX size={16} />
            <strong>{contained.length}</strong>
            <span>Contained actions</span>
          </div>
          <div>
            <ShieldAlert size={16} />
            <strong>{shieldIncidents.length}</strong>
            <span>Shield findings</span>
          </div>
        </div>
      </section>

      <div className="stat-strip" style={{ marginBottom: '1rem' }}>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Flagged actions</p>
          <p className="stat-strip__value">{withAnomalies.length}</p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Blocked</p>
          <p className="stat-strip__value" style={{ color: 'var(--danger)' }}>
            {blocked.length}
          </p>
        </div>
        <div className="stat-strip__item">
          <p className="stat-strip__label">Held for review</p>
          <p className="stat-strip__value" style={{ color: 'var(--warning)' }}>
            {held.length}
          </p>
        </div>
      </div>

      <div className="threat-grid">
        {THREAT_TYPES.map((t) => {
          const count = audit.filter((e) => e.anomalyFlags.includes(t.id)).length
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              className={`threat-type-card${threatTypeFilter === t.id ? ' threat-type-card--active' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setThreatTypeFilter((cur) => (cur === t.id ? null : t.id))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setThreatTypeFilter((cur) => (cur === t.id ? null : t.id)) }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {count} {count === 1 ? 'event' : 'events'} · {riskLabel(t.severity)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-label">
          Threats over time (last 24h) · {threats24h} event{threats24h !== 1 ? 's' : ''}
        </div>
        <div className="spark" style={{ height: 56 }}>
          {hourlyCounts.map((count, i) => {
            // Proportional bar height; empty hours render a 2px baseline so the
            // axis stays visible without implying activity.
            const h = count === 0 ? 2 : Math.round((count / maxHourly) * 40) + 4
            const hoursAgo = 23 - i
            return (
              <span
                key={i}
                style={{ height: `${h}px` }}
                title={`${count} threat${count !== 1 ? 's' : ''} · ${hoursAgo === 0 ? 'this hour' : `${hoursAgo}h ago`}`}
              />
            )
          })}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        {([['all', 'All'], ['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium']] as const).map(
          ([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${severityFilter === id ? 'active' : ''}`}
              onClick={() => setSeverityFilter(id)}
            >
              {label}
            </button>
          ),
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)' }}>
          {filtered.length} of {threats.length} threats
        </span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Threat</th>
              <th>Source</th>
              <th>AI / runtime reasoning</th>
              <th>Response</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  {threats.length === 0
                    ? 'No threats in current log'
                    : 'No threats match this severity filter'}
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} onClick={() => onSelect(e)}>
                  <td>
                    {e.anomalyFlags.length
                      ? e.anomalyFlags.map(anomalyLabel).join(', ')
                      : actionLabel(e.action)}
                  </td>
                  <td>{actorLabel(e.actor)}</td>
                  <td style={{ maxWidth: 280 }}>{e.reasoning}</td>
                  <td>
                    {e.shield && e.shield.level !== 'clear' && (
                      <span className={`badge ${
                        e.shield.level === 'critical'
                          ? 'danger'
                          : e.shield.level === 'high'
                            ? 'warning'
                            : 'neutral'
                      }`}>
                        Shield {e.shield.level} · {e.shield.score}/100
                      </span>
                    )}
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {decisionLabel(e.decision)}
                    </span>
                    <span style={{ color: 'var(--muted)', marginLeft: '0.5rem' }}>
                      {timeAgo(e.timestamp)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
