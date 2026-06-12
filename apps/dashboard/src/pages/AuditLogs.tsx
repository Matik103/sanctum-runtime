import { useMemo, useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { RefreshCw, Search } from 'lucide-react'
import { AuditRecord } from '../components/AuditRecord'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { useOrgAudit } from '../hooks/useOrgAudit'
import { decisionTone, timeAgo } from '../lib/format'
import { decisionLabel } from '../lib/labels'
import { auditRecordText } from '../lib/narrative'
import type { PageId } from '../layout/Sidebar'

type Props = {
  orgId?: string | null
  onSelect: (e: ActionResult) => void
  onPage?: (p: PageId) => void
}

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

export function AuditLogs({ orgId, onSelect, onPage }: Props) {
  const [search, setSearch] = useState('')
  const [decision, setDecision] = useState('')
  const [heldOnly, setHeldOnly] = useState(false)

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      decision: decision || undefined,
      heldOnly,
    }),
    [search, decision, heldOnly],
  )

  const {
    entries,
    loading,
    loadingMore,
    error,
    nextCursor,
    totalApprox,
    retentionDays,
    refresh,
    loadMore,
  } = useOrgAudit(orgId, filters)

  const exportJson = () => {
    download('sanctum-audit.json', JSON.stringify(entries, null, 2), 'application/json')
  }

  const exportCsv = () => {
    const headers = ['id', 'actor', 'action', 'decision', 'risk', 'human_record', 'reasoning', 'timestamp']
    const rows = entries.map((e) =>
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
            Durable org-wide record of every agent action and trust decision
            {retentionDays ? ` · ${retentionDays}-day retention on your plan` : ''}
            {' · '}
            <span title="Cryptographic integrity proofs are on the enterprise roadmap">integrity: standard audit</span>
          </p>
        </div>
        <PageActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()} disabled={loading}>
            <RefreshCw size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Refresh
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportJson} disabled={entries.length === 0}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV
          </button>
        </PageActions>
      </header>

      {error && (
        <PlanGateAlert message={error} onDismiss={() => refresh()} style={{ marginBottom: '0.75rem' }} />
      )}

      <div className="card audit-toolbar" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }} />
            <input
              className="input"
              style={{ paddingLeft: '2rem', width: '100%' }}
              placeholder="Search action, actor, reasoning…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search audit"
            />
          </div>
          <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Filter decision">
            <option value="">All decisions</option>
            <option value="APPROVED">Approved</option>
            <option value="REQUIRE_VERIFICATION">Held</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <button
            type="button"
            className={`btn btn-sm ${heldOnly ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setHeldOnly((v) => !v)}
          >
            Held only
          </button>
          {totalApprox != null && (
            <span className="badge neutral" style={{ fontSize: '0.72rem' }}>
              ~{totalApprox.toLocaleString()} in window
            </span>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Record</th>
              <th>Actor</th>
              <th>Decision</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 && (
              <tr><td colSpan={4} className="empty">Loading audit history…</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    title="No audit records in this window"
                    description={orgId ? 'Actions appear here as soon as agents verify through Sanctum.' : 'Sign in and select a workspace.'}
                  >
                    {onPage && orgId && (
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPage('connect')}>Connect an agent</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('agents')}>Register agent</button>
                      </div>
                    )}
                  </EmptyState>
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="feed-row" onClick={() => onSelect(e)}>
                <td style={{ maxWidth: '28rem' }}>
                  <AuditRecord entry={e} compact />
                </td>
                <td style={{ fontSize: '0.82rem', opacity: 0.85 }}>{e.actor}</td>
                <td>
                  <span className={`badge ${decisionTone(e.decision)}`}>{decisionLabel(e.decision)}</span>
                </td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{timeAgo(e.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}
