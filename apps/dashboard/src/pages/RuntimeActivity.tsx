import { useMemo, useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk'
import { decisionTone, timeAgo } from '../lib/format'
import {
  actionLabel,
  actorLabel,
  contextFieldLabel,
  decisionLabel,
  formatContextValue,
  policyLabel,
} from '../lib/labels'

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
        e.reasoning.toLowerCase().includes(q)
      const matchFilter =
        filter === 'all' ||
        (filter === 'approved' && e.decision === 'APPROVED') ||
        (filter === 'blocked' && e.decision === 'BLOCKED') ||
        (filter === 'verify' && e.decision === 'REQUIRE_VERIFICATION') ||
        (filter === 'high' && e.risk === 'high')
      return matchSearch && matchFilter
    })
  }, [audit, search, filter])

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Runtime activity</h1>
          <p>Full visibility into AI behavior and execution decisions</p>
        </div>
      </header>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search action, actor, context…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {[
          ['all', 'All'],
          ['approved', 'Approved'],
          ['blocked', 'Blocked'],
          ['verify', 'Verification'],
          ['high', 'High risk'],
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
              <th>Actor</th>
              <th>Action</th>
              <th>Context</th>
              <th>Risk</th>
              <th>Policy</th>
              <th>Decision</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No matching events
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} onClick={() => onSelect(e)}>
                  <td>{actorLabel(e.actor)}</td>
                  <td>{actionLabel(e.action)}</td>
                  <td style={{ maxWidth: 160, color: 'var(--muted)' }}>
                    {Object.entries(e.context)
                      .slice(0, 2)
                      .map(
                        ([k, v]) =>
                          `${contextFieldLabel(k)}: ${formatContextValue(k, v)}`,
                      )
                      .join(' · ') || '—'}
                  </td>
                  <td>
                    <span className={`badge ${e.risk === 'high' ? 'danger' : e.risk === 'medium' ? 'warning' : 'neutral'}`}>
                      {e.risk}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{policyLabel(e.policyPath)}</td>
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
