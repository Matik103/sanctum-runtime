import type { ActionResult } from '@sanctum/sdk'
import { decisionTone, timeAgo } from '../lib/format'

const THREAT_TYPES = [
  { id: 'unusual_time_access', label: 'Abnormal timing', severity: 'medium' },
  { id: 'owner_absent_or_sleeping', label: 'Owner vulnerable', severity: 'high' },
  { id: 'suspicious_prompt_pattern', label: 'Prompt injection', severity: 'high' },
  { id: 'unsafe_command_chain', label: 'Unsafe escalation', severity: 'high' },
  { id: 'high_value_transfer', label: 'High-value transfer', severity: 'medium' },
]

type Props = { audit: ActionResult[]; onSelect: (e: ActionResult) => void }

export function ThreatMonitor({ audit, onSelect }: Props) {
  const threats = audit.filter(
    (e) => e.decision !== 'APPROVED' || e.anomalyFlags.length > 0,
  )

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Runtime threat detection</h1>
          <p>Behavioral anomalies and unsafe execution attempts</p>
        </div>
      </header>

      <div className="threat-grid">
        {THREAT_TYPES.map((t) => {
          const count = audit.filter((e) => e.anomalyFlags.includes(t.id)).length
          return (
            <div key={t.id} className="threat-type-card">
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.label}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {count} detections · {t.severity}
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
              threats.filter((e) => new Date(e.timestamp).getHours() === i).length * 12 + 4,
            )
            return <span key={i} style={{ height: `${h}px` }} />
          })}
        </div>
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
            {threats.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No threats in current log
                </td>
              </tr>
            ) : (
              threats.map((e) => (
                <tr key={e.id} onClick={() => onSelect(e)}>
                  <td>{e.anomalyFlags.join(', ') || 'Policy hold'}</td>
                  <td>{e.actor}</td>
                  <td style={{ maxWidth: 280 }}>{e.reasoning}</td>
                  <td>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {e.decision.replace(/_/g, ' ')}
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
