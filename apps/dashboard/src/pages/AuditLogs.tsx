import type { ActionResult } from '@sanctum/runtime'
import { decisionTone, timeAgo } from '../lib/format'

type Props = { audit: ActionResult[]; onSelect: (e: ActionResult) => void }

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AuditLogs({ audit, onSelect }: Props) {
  const exportJson = () => {
    download('sanctum-audit.json', JSON.stringify(audit, null, 2), 'application/json')
  }

  const exportCsv = () => {
    const headers = [
      'id',
      'actor',
      'action',
      'decision',
      'risk',
      'reasoning',
      'timestamp',
    ]
    const rows = audit.map((e) =>
      [
        e.id,
        e.actor,
        e.action,
        e.decision,
        e.risk,
        `"${e.reasoning.replace(/"/g, '""')}"`,
        e.timestamp,
      ].join(','),
    )
    download('sanctum-audit.csv', [headers.join(','), ...rows].join('\n'), 'text/csv')
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Audit logs</h1>
          <p>Immutable-style execution history for compliance and review</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost" onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </header>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Event ID</th>
              <th>Action</th>
              <th>Decision</th>
              <th>Policy</th>
              <th>Runtime</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id} onClick={() => onSelect(e)}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                  {e.id.slice(0, 8)}…
                </td>
                <td>{e.action}</td>
                <td>
                  <span className={`badge ${decisionTone(e.decision)}`}>
                    {e.decision}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)' }}>{e.policyPath}</td>
                <td style={{ color: 'var(--muted)' }}>
                  {e.modelInvoked ? 'Model' : 'Heuristic'}
                </td>
                <td style={{ color: 'var(--muted)' }}>{timeAgo(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
