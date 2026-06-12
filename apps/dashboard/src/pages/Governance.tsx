import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Clock, XCircle, GitBranch, AlertTriangle, ChevronRight, Eye } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { throwResponseError, formatApiError } from '../lib/sanitize-error'
import { timeAgo } from '../lib/format'
import { Alert } from '../components/ui/Alert'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { TabBar } from '../components/ui/TabBar'
import { fetchMyOrgs } from '../lib/fleet'
import { readPageQuery, type NavigateQuery } from '../lib/navigate'
import type { PageId } from '../layout/Sidebar'

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated'

type PendingApproval = {
  id: string
  action: string
  actor?: string
  audit_event_id?: string
  status: ApprovalStatus
  current_step: number
  approvals: Array<{ user_id: string; role: string; decision: string; note?: string; timestamp: string }>
  expires_at: string
  created_at: string
  context: Record<string, unknown>
}

type Workflow = {
  id: string
  name: string
  action_pattern: string
  steps: Array<{ role: string; required_count: number }>
  expiry_minutes: number
  escalation_after_minutes?: number
  is_active: boolean
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

function statusIcon(status: ApprovalStatus) {
  switch (status) {
    case 'approved': return <CheckCircle size={15} style={{ color: 'var(--success)' }} />
    case 'rejected': return <XCircle size={15} style={{ color: 'var(--danger)' }} />
    case 'expired': return <AlertTriangle size={15} style={{ color: 'var(--muted)' }} />
    case 'escalated': return <ChevronRight size={15} style={{ color: 'var(--warn, #f59e0b)' }} />
    default: return <Clock size={15} style={{ color: 'var(--primary)' }} />
  }
}

function statusBadge(status: ApprovalStatus) {
  const map: Record<ApprovalStatus, string> = {
    pending: 'warn',
    approved: 'success',
    rejected: 'danger',
    expired: 'neutral',
    escalated: 'warn',
  }
  return map[status] ?? 'neutral'
}

export function Governance({ onPage }: { onPage?: (p: PageId, query?: NavigateQuery) => void }) {
  const [orgId, setOrgId] = useState('')
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [tab, setTab] = useState<'approvals' | 'workflows'>('approvals')
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('pending')
  const [decideId, setDecideId] = useState<string | null>(null)
  const [decideNote, setDecideNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [newWf, setNewWf] = useState<Partial<Workflow> | null>(null)
  const [focusAction, setFocusAction] = useState<string | null>(null)

  useEffect(() => {
    const params = readPageQuery()
    const action = params.get('focus_action')
    if (action) {
      setTab('approvals')
      setStatusFilter('pending')
      setFocusAction(action)
    }
  }, [])

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!orgId) return
    const h = await authHeaders()
    const q = statusFilter === 'all' ? '' : `?status=${statusFilter}`
    const [aRes, wRes] = await Promise.all([
      fetch(`${apiBaseUrl}/v1/orgs/${orgId}/approvals${q}`, { headers: h }),
      fetch(`${apiBaseUrl}/v1/orgs/${orgId}/workflows`, { headers: h }),
    ])
    if (aRes.ok) {
      const list = await aRes.json() as PendingApproval[]
      setApprovals(list)
      // When the current view already includes pending rows, the true pending
      // count is derivable here without a second request.
      if (statusFilter === 'pending' || statusFilter === 'all') {
        setPendingCount(list.filter((a) => a.status === 'pending').length)
      }
    }
    if (wRes.ok) setWorkflows(await wRes.json() as Workflow[])

    // Otherwise the filtered list can't tell us how many are pending — fetch the
    // pending count explicitly so the tab badge is always accurate.
    if (statusFilter !== 'pending' && statusFilter !== 'all') {
      const pRes = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/approvals?status=pending`, { headers: h })
      if (pRes.ok) setPendingCount((await pRes.json() as PendingApproval[]).length)
    }
  }, [orgId, statusFilter])

  useEffect(() => { void load() }, [load])

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (!orgId) return
    const approval = approvals.find((a) => a.id === id)
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/approvals/${id}/decide`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ decision, note: decideNote }),
      })
      if (!res.ok) await throwResponseError(res, 'Request failed')
      const released = decision === 'approve' && approval?.audit_event_id
      setMsg({
        text: released
          ? 'Approved — held Connect tool released. Check Live Feed for the updated decision.'
          : decision === 'approve'
            ? 'Action approved.'
            : 'Action rejected.',
        variant: 'success',
      })
      setDecideId(null)
      setDecideNote('')
      await load()
    } catch (e) {
      setMsg({ text: formatApiError(e, 'Failed'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const saveWorkflow = async () => {
    if (!orgId || !newWf) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/workflows`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          name: newWf.name,
          action_pattern: newWf.action_pattern,
          steps: [{ role: 'admin', required_count: 1 }],
          expiry_minutes: newWf.expiry_minutes ?? 60,
          is_active: true,
        }),
      })
      if (!res.ok) await throwResponseError(res, 'Request failed')
      setMsg({ text: 'Workflow created.', variant: 'success' })
      setNewWf(null)
      await load()
    } catch (e) {
      setMsg({ text: formatApiError(e, 'Failed'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Governance</h1>
          <p>Approval workflows and multi-step human review chains</p>
        </div>
      </header>

      {focusAction && (
        <Alert variant="info" onDismiss={() => setFocusAction(null)} style={{ marginBottom: '1rem' }}>
          Showing pending approvals matching <code>{focusAction}</code> from Live Feed.
        </Alert>
      )}

      {msg && (
        msg.variant === 'error'
          ? <PlanGateAlert message={msg.text} onDismiss={() => setMsg(null)} style={{ marginBottom: '1rem' }} />
          : (
            <Alert variant={msg.variant} onDismiss={() => setMsg(null)} style={{ marginBottom: '1rem' }}>
              {msg.text}
            </Alert>
          )
      )}

      <TabBar
        tabs={[
          { id: 'approvals' as const, label: 'Pending Approvals', count: pendingCount },
          { id: 'workflows' as const, label: 'Workflows', count: workflows.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'approvals' && (
        <>
          <div className="toolbar" style={{ marginBottom: '1rem' }}>
            {([['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['expired', 'Expired'], ['escalated', 'Escalated']] as const).map(([s, label]) => (
              <button key={s} type="button" className={`chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
                {label}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Step</th>
                  <th>Expires</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {approvals.length === 0 ? (
                  <tr><td colSpan={7} className="empty">No approvals {statusFilter !== 'all' ? `with status "${statusFilter}"` : ''}</td></tr>
                ) : approvals.map((a) => (
                  <tr
                    key={a.id}
                    className={focusAction && a.action === focusAction ? 'governance-row--focus' : undefined}
                  >
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {statusIcon(a.status)}
                        <span className={`badge ${statusBadge(a.status)}`}>{a.status}</span>
                      </span>
                    </td>
                    <td><code style={{ fontSize: '0.8rem' }}>{a.action}</code></td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{a.actor ?? '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>Step {a.current_step + 1} · {a.approvals.length} vote{a.approvals.length !== 1 ? 's' : ''}</td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{timeAgo(a.expires_at)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{timeAgo(a.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {onPage && a.status === 'pending' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            title="Open matching event in Live Feed"
                            onClick={() => onPage('live-feed', {
                              tab: 'held',
                              ...(a.audit_event_id
                                ? { focus_event: a.audit_event_id }
                                : { focus_action: a.action }),
                            })}
                          >
                            <Eye size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                            Live Feed
                          </button>
                        )}
                        {a.status === 'pending' && (
                          decideId === a.id ? (
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input
                                className="input"
                                placeholder="Note (optional)"
                                value={decideNote}
                                onChange={(e) => setDecideNote(e.target.value)}
                                style={{ width: '10rem', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                              />
                              <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void decide(a.id, 'approve')}>Approve</button>
                              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void decide(a.id, 'reject')} style={{ color: 'var(--danger)' }}>Reject</button>
                              <button type="button" className="btn btn-sm" onClick={() => setDecideId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <button type="button" className="btn btn-sm" onClick={() => setDecideId(a.id)}>Review</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'workflows' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => setNewWf({ expiry_minutes: 60 })}>
              <GitBranch size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
              New workflow
            </button>
          </div>

          {newWf !== null && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <strong style={{ fontSize: '0.9rem' }}>New approval workflow</strong>
              <div className="responsive-form-grid" style={{ gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Name</label>
                  <input className="input" placeholder="e.g. Financial actions" value={newWf.name ?? ''} onChange={(e) => setNewWf(w => ({ ...w, name: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Action pattern (glob)</label>
                  <input className="input" placeholder="e.g. transfer_funds*" value={newWf.action_pattern ?? ''} onChange={(e) => setNewWf(w => ({ ...w, action_pattern: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}>Expires (min)</label>
                  <input className="input" type="number" min={5} max={1440} value={newWf.expiry_minutes ?? 60} onChange={(e) => setNewWf(w => ({ ...w, expiry_minutes: Number(e.target.value) }))} style={{ width: '6rem' }} />
                </div>
              </div>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Creates a single-step chain: one admin approval required. Multi-step chains
                (e.g. admin → owner) can be defined via the workflows API.
              </p>
              <div className="responsive-action-row" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-primary" disabled={busy || !newWf.name || !newWf.action_pattern} onClick={() => void saveWorkflow()}>
                  {busy ? 'Saving…' : 'Save workflow'}
                </button>
                <button type="button" className="btn" onClick={() => setNewWf(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Pattern</th>
                  <th>Steps</th>
                  <th>Expires</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workflows.length === 0 ? (
                  <tr><td colSpan={5} className="empty">No workflows — create one to require approvals for matching actions</td></tr>
                ) : workflows.map((w) => (
                  <tr key={w.id}>
                    <td style={{ fontWeight: 500 }}>{w.name}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{w.action_pattern}</code></td>
                    <td style={{ fontSize: '0.85rem' }}>{w.steps.map(s => `${s.required_count} ${s.role}`).join(' → ')}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{w.expiry_minutes}m</td>
                    <td><span className={`badge ${w.is_active ? 'success' : 'neutral'}`}>{w.is_active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
