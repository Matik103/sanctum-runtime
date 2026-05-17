import { useState } from 'react'
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
  { id: 'unusual_time_access', label: 'Abnormal timing', severity: 'medium' },
  { id: 'owner_absent_or_sleeping', label: 'Owner vulnerable', severity: 'high' },
  { id: 'suspicious_prompt_pattern', label: 'Prompt injection', severity: 'high' },
  { id: 'unsafe_command_chain', label: 'Unsafe escalation', severity: 'high' },
  { id: 'rapid_repeat_action', label: 'Rapid repeat', severity: 'medium' },
  { id: 'privilege_escalation_chain', label: 'Privilege escalation', severity: 'high' },
  { id: 'high_value_transfer', label: 'High-value transfer', severity: 'medium' },
]

type Props = { audit: ActionResult[]; onSelect: (e: ActionResult) => void }

export function ThreatMonitor({ audit, onSelect }: Props) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')

  const withAnomalies = audit.filter((e) => e.anomalyFlags.length > 0)
  const blocked = audit.filter((e) => e.decision === 'BLOCKED')
  const held = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION')

  const threats = audit.filter(
    (e) => e.decision !== 'APPROVED' || e.anomalyFlags.length > 0,
  )

  const filtered = threats.filter((e) => {
    if (severityFilter === 'all') return true
    if (severityFilter === 'high') {
      return (
        e.decision === 'BLOCKED' ||
        e.anomalyFlags.some(
          (f) => THREAT_TYPES.find((t) => t.id === f)?.severity === 'high',
        )
      )
    }
    return e.anomalyFlags.some(
      (f) => THREAT_TYPES.find((t) => t.id === f)?.severity === 'medium',
    )
  })

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Runtime threat detection</h1>
          <p>Behavioral anomalies and unsafe execution attempts</p>
        </div>
      </header>

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
            <div key={t.id} className="threat-type-card">
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {count} {count === 1 ? 'event' : 'events'} · {riskLabel(t.severity)}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-label">Threats over time (24h)</div>
        <div className="spark" style={{ height: 56 }}>
          {Array.from({ length: 24 }, (_, i) => {
            const h = Math.min(
              40,
              threats.filter((e) => new Date(e.timestamp).getUTCHours() === i).length * 12 + 4,
            )
            return <span key={i} style={{ height: `${h}px` }} />
          })}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        {([['all', 'All'], ['high', 'High severity'], ['medium', 'Medium severity']] as const).map(
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
