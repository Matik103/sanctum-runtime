import { useMemo, useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { decisionTone, timeAgo } from '../lib/format'
import { AuditRecord } from '../components/AuditRecord'
import { actionLabel, decisionLabel, riskLabel } from '../lib/labels'
import { auditRecordText } from '../lib/narrative'

type Props = {
  audit: ActionResult[]
  onSelect: (e: ActionResult) => void
}

export function RuntimeActivity({ audit, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const rows = useMemo(() => {
    return audit.filter((e) => {
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        e.action.includes(q) ||
        e.actor.includes(q) ||
        (e.reasoning ?? '').toLowerCase().includes(q) ||
        auditRecordText(e).toLowerCase().includes(q)
      const isProxy = (e.context as Record<string, unknown> | undefined)?.proxy === true
      const matchFilter =
        filter === 'all' ||
        (filter === 'approved' && e.decision === 'APPROVED') ||
        (filter === 'blocked' && e.decision === 'BLOCKED') ||
        (filter === 'verify' && e.decision === 'REQUIRE_VERIFICATION') ||
        (filter === 'high' && e.risk === 'high') ||
        (filter === 'proxy' && isProxy)
      return matchSearch && matchFilter
    })
  }, [audit, search, filter])

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Runtime Activity</h1>
          <p>Real-time visibility into agent actions and execution decisions</p>
        </div>
      </header>

      <div style={{ padding: '0.4rem 0 0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        {rows.length === audit.length
          ? `${audit.length} event${audit.length !== 1 ? 's' : ''}`
          : `${rows.length} of ${audit.length} events`}
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
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
        {[
          ['all', 'All'],
          ['approved', 'Approved'],
          ['blocked', 'Blocked'],
          ['verify', 'Verification'],
          ['high', 'High risk'],
          ['proxy', 'Proxy'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`chip ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id)}
          >
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No matching events
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} onClick={() => onSelect(e)}>
                  <td className="audit-record-cell">
                    <AuditRecord entry={e} compact />
                  </td>
                  <td>
                    {actionLabel(e.action)}
                    {(e.context as Record<string, unknown> | undefined)?.proxy === true && (
                      <span style={{ marginLeft: 6, fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: 'var(--accent,#6366f1)', fontWeight: 500 }}>
                        {String((e.context as Record<string, unknown>).platform ?? 'proxy')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${e.risk === 'high' ? 'danger' : e.risk === 'medium' ? 'warning' : 'neutral'}`}>
                      {riskLabel(e.risk)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${decisionTone(e.decision)}`}>
                      {decisionLabel(e.decision)}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{timeAgo(e.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
