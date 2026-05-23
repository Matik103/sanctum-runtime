import type { ActionResult, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { AuditRecord } from '../components/AuditRecord'
import { PageActions } from '../components/ui/PageActions'
import { decisionTone, timeAgo } from '../lib/format'
import { decisionLabel } from '../lib/labels'
import { auditRecordText } from '../lib/narrative'

type Props = { audit: ActionResult[]; onSelect: (e: ActionResult) => void; status?: RuntimeStatus | null }

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function AuditLogs({ audit, onSelect, status }: Props) {
  const fallbackModel = status?.riskModel ?? status?.ollamaModel
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
      'human_record',
      'reasoning',
      'timestamp',
    ]
    const rows = audit.map((e) =>
      [
        escapeCsv(e.id),
        escapeCsv(e.actor),
        escapeCsv(e.action),
        escapeCsv(e.decision),
        escapeCsv(e.risk ?? ''),
        escapeCsv(auditRecordText(e)),
        escapeCsv(e.reasoning),
        escapeCsv(e.timestamp),
      ].join(','),
    )
    download('sanctum-audit.csv', [headers.join(','), ...rows].join('\n'), 'text/csv')
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Audit Logs</h1>
          <p>
            Immutable record of every agent action and trust decision
          </p>
        </div>
        <PageActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
        </PageActions>
      </header>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Record</th>
              <th>Decision</th>
              <th>Runtime</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No audit records yet — agent actions will appear here as readable entries.
                </td>
              </tr>
            ) : (
              audit.map((e) => (
                <tr key={e.id} onClick={() => onSelect(e)}>
                  <td className="audit-record-cell">
                    <AuditRecord entry={e} compact />
                    <span
                      style={{
                        display: 'block',
                        marginTop: '0.35rem',
                        fontFamily: 'monospace',
                        fontSize: '0.68rem',
                        color: 'var(--muted)',
                      }}
                    >
                      {e.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {decisionLabel(e.decision)}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>
                    {e.modelInvoked ? (() => {
                      const m = e.riskModelName ?? fallbackModel
                      return (
                        <span title={m ? `Scored by ${m}` : 'Scored by AI risk model'}>
                          AI model
                          {m && (
                            <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.7, marginTop: '0.1rem' }}>
                              {m}
                            </span>
                          )}
                        </span>
                      )
                    })() : (
                      'Policy'
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)', verticalAlign: 'top' }}>
                    {timeAgo(e.timestamp)}
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
