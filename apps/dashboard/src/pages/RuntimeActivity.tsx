import { useMemo, useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { ExternalLink } from 'lucide-react'
import { decisionTone, timeAgo } from '../lib/format'
import { AuditRecord } from '../components/AuditRecord'
import { actionLabel, decisionLabel, riskLabel } from '../lib/labels'
import { useOrgAudit } from '../hooks/useOrgAudit'
import { EmptyState } from '../components/ui/EmptyState'
import type { PageId } from '../layout/Sidebar'

type Props = {
  orgId?: string | null
  onSelect: (e: ActionResult) => void
  onPage?: (p: PageId) => void
}

export function RuntimeActivity({ orgId, onSelect, onPage }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const serverFilters = useMemo(() => {
    if (filter === 'verify') return { heldOnly: true, search: search.trim() || undefined }
    if (filter === 'approved') return { decision: 'APPROVED', search: search.trim() || undefined }
    if (filter === 'blocked') return { decision: 'BLOCKED', search: search.trim() || undefined }
    if (filter === 'high') return { highRiskOnly: true, search: search.trim() || undefined }
    return { search: search.trim() || undefined }
  }, [filter, search])

  const { entries, loading, loadingMore, totalApprox, retentionDays, nextCursor, loadMore } = useOrgAudit(orgId, serverFilters)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Runtime Activity</h1>
          <p>
            Live agent actions from your org audit store
            {retentionDays ? ` · ${retentionDays}-day retention` : ''}
          </p>
        </div>
        {onPage && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('audit')}>
            <ExternalLink size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Full audit logs
          </button>
        )}
      </header>

      <div style={{ padding: '0.4rem 0 0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        {loading ? 'Loading…' : `${entries.length} event${entries.length !== 1 ? 's' : ''}${totalApprox != null ? ` · ~${totalApprox.toLocaleString()} in window` : ''}`}
      </div>

      <div className="toolbar">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Search action, actor, context…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingRight: search ? '2rem' : undefined }}
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="btn btn-ghost" style={{ position: 'absolute', right: '0.25rem', padding: '0.15rem 0.35rem' }}>×</button>
          )}
        </div>
        {[
          ['all', 'All'],
          ['approved', 'Approved'],
          ['blocked', 'Blocked'],
          ['verify', 'Held for review'],
          ['high', 'High risk'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Record</th>
              <th>Action</th>
              <th>Risk</th>
              <th>Decision</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {!loading && entries.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No matching events" description="Connect an agent or run a verify test to populate activity.">
                    {onPage && (
                      <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => onPage('connect')}>
                        Connect an agent
                      </button>
                    )}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="feed-row" onClick={() => onSelect(e)}>
                  <td className="audit-record-cell"><AuditRecord entry={e} compact /></td>
                  <td>{actionLabel(e.action)}</td>
                  <td>
                    <span className={`badge ${e.risk === 'high' ? 'danger' : e.risk === 'medium' ? 'warning' : 'neutral'}`}>
                      {riskLabel(e.risk)}
                    </span>
                  </td>
                  <td><span className={`badge ${decisionTone(e.decision)}`}>{decisionLabel(e.decision)}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{timeAgo(e.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div style={{ padding: '0.75rem 0', textAlign: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={() => loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more events'}
          </button>
        </div>
      )}
    </>
  )
}
