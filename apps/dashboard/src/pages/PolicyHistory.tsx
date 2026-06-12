import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw, Tag } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { throwResponseError, formatApiError } from '../lib/sanitize-error'
import { Alert } from '../components/ui/Alert'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { timeAgo } from '../lib/format'
import { fetchMyOrgs } from '../lib/fleet'

type PolicySnapshot = {
  id: string
  org_id: string
  label?: string
  change_summary?: string
  created_by_user_id?: string
  created_at: string
  snapshot: Record<string, unknown>
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

import { api } from '../lib/api'
import type { PolicyMap } from '@sanctum-runtime/sdk/browser'
import type { PageId } from '../layout/Sidebar'
import { PlanFeatureBanner } from '../components/PlanFeatureBanner'
import { useWorkspacePlan } from '../hooks/useWorkspacePlan'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { canUsePolicyEditor } from '../lib/billing'

type PolicyDiff = {
  added: string[]
  removed: string[]
  changed: string[]
}

function policyKeyLabel(key: string): string {
  const idx = key.indexOf(':')
  return idx >= 0 ? key.slice(idx + 1) : key
}

function diffPolicies(live: PolicyMap, snapshot: Record<string, unknown>): PolicyDiff {
  const snap = snapshot as PolicyMap
  const liveKeys = new Set(Object.keys(live).filter((k) => !k.startsWith('__')))
  const snapKeys = new Set(Object.keys(snap).filter((k) => !k.startsWith('__')))
  const added = [...snapKeys].filter((k) => !liveKeys.has(k)).map(policyKeyLabel)
  const removed = [...liveKeys].filter((k) => !snapKeys.has(k)).map(policyKeyLabel)
  const changed = [...snapKeys]
    .filter((k) => liveKeys.has(k) && JSON.stringify(live[k]) !== JSON.stringify(snap[k]))
    .map(policyKeyLabel)
  return { added, removed, changed }
}

export function PolicyHistory({ onPage }: { onPage?: (p: PageId) => void }) {
  const { planId } = useWorkspacePlan()
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const canSnapshot = canUsePolicyEditor(planId)
  const [orgId, setOrgId] = useState('')
  const [snapshots, setSnapshots] = useState<PolicySnapshot[]>([])
  const [selected, setSelected] = useState<PolicySnapshot | null>(null)
  const [label, setLabel] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [showSave, setShowSave] = useState(false)
  const [livePolicies, setLivePolicies] = useState<PolicyMap>({})

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    void api.getPolicies(orgId).then(setLivePolicies).catch(() => setLivePolicies({}))
  }, [orgId])

  const load = useCallback(async () => {
    if (!orgId) return
    const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/policy-snapshots`, { headers: await authHeaders() })
    if (res.ok) setSnapshots(await res.json() as PolicySnapshot[])
  }, [orgId])

  useEffect(() => { void load() }, [load])

  const saveSnapshot = async () => {
    if (!orgId) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/policy-snapshots`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ label: label || undefined, change_summary: summary || undefined }),
      })
      if (!res.ok) await throwResponseError(res, 'Request failed')
      setMsg({ text: 'Snapshot saved.', variant: 'success' })
      setLabel('')
      setSummary('')
      setShowSave(false)
      await load()
    } catch (e) {
      setMsg({ text: formatApiError(e, 'Failed'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const restore = async (snapshotId: string) => {
    if (!orgId) return
    const ok = await confirm({
      title: 'Restore policy snapshot?',
      message: 'Current org policies will be overwritten with this snapshot.',
      confirmLabel: 'Restore snapshot',
      variant: 'warn',
      impact: ['All live policy changes since this snapshot will be lost', 'Agents may see different approve/hold/block behavior immediately'],
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/policy-snapshots/${snapshotId}/restore`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      if (!res.ok) await throwResponseError(res, 'Request failed')
      setMsg({ text: 'Policies restored to snapshot.', variant: 'success' })
      setSelected(null)
    } catch (e) {
      setMsg({ text: formatApiError(e, 'Failed'), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const policyCount = (snap: PolicySnapshot) => Object.keys(snap.snapshot).filter((k) => !k.startsWith('__')).length
  const selectedDiff = selected ? diffPolicies(livePolicies, selected.snapshot) : null

  return (
    <>
      <ConfirmDialog />
      <header className="page-header">
        <div>
          <h1>Policy History</h1>
          <p>Version-controlled policy snapshots with one-click rollback</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowSave(true)} disabled={!canSnapshot}>
          <Tag size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
          Save snapshot
        </button>
        {onPage && (
          <button type="button" className="btn btn-ghost" onClick={() => onPage('policies')}>
            Edit policies
          </button>
        )}
      </header>

      <PlanFeatureBanner
        feature="Policy snapshots"
        message="Saving and restoring snapshots requires Personal or higher."
        allowed={canSnapshot}
        onPage={onPage}
      />

      {msg && (
        msg.variant === 'error'
          ? <PlanGateAlert message={msg.text} onDismiss={() => setMsg(null)} style={{ marginBottom: '1rem' }} />
          : (
            <Alert variant={msg.variant} onDismiss={() => setMsg(null)} style={{ marginBottom: '1rem' }}>
              {msg.text}
            </Alert>
          )
      )}

      {showSave && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <strong style={{ fontSize: '0.9rem' }}>Save policy snapshot</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem', maxWidth: '28rem' }}>
            <input
              className="input"
              placeholder="Label (e.g. v1.2 — pre-deploy)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              className="input"
              placeholder="Change summary (optional)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <div className="responsive-action-row">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveSnapshot()}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn" onClick={() => setShowSave(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="responsive-split" style={{ gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        <div className="table-wrap">
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <History size={16} />
            <strong style={{ fontSize: '0.9rem' }}>Snapshots</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>{snapshots.length} saved</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Label</th>
                <th>Policies</th>
                <th>Saved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr><td colSpan={4} className="empty">No snapshots yet — save one before making policy changes</td></tr>
              ) : snapshots.map((s) => (
                <tr
                  key={s.id}
                  className="feed-row"
                  onClick={() => setSelected(selected?.id === s.id ? null : s)}
                  style={{ background: selected?.id === s.id ? 'var(--surface-raised)' : undefined }}
                >
                  <td>
                    <span style={{ fontWeight: 500 }}>{s.label ?? 'Unnamed snapshot'}</span>
                    {s.change_summary && (
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                        {s.change_summary}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{policyCount(s)} policies</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{timeAgo(s.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={(e) => { e.stopPropagation(); void restore(s.id) }}
                      title="Restore to this snapshot"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <strong style={{ fontSize: '0.9rem' }}>{selected.label ?? 'Snapshot'}</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.2rem 0 0' }}>{timeAgo(selected.created_at)} · {policyCount(selected)} policies</p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void restore(selected.id)}>
                <RotateCcw size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                Restore
              </button>
            </div>
            <div style={{ overflow: 'auto', maxHeight: '400px' }}>
              {selectedDiff && (selectedDiff.added.length + selectedDiff.removed.length + selectedDiff.changed.length > 0) && (
                <div style={{ marginBottom: '0.85rem', fontSize: '0.82rem' }}>
                  <strong>Diff vs live policies</strong>
                  <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.55 }}>
                    {selectedDiff.added.map((a) => <li key={`a-${a}`}><span className="badge success" style={{ marginRight: 6 }}>+</span>{a}</li>)}
                    {selectedDiff.removed.map((a) => <li key={`r-${a}`}><span className="badge danger" style={{ marginRight: 6 }}>−</span>{a}</li>)}
                    {selectedDiff.changed.map((a) => <li key={`c-${a}`}><span className="badge warning" style={{ marginRight: 6 }}>~</span>{a}</li>)}
                  </ul>
                </div>
              )}
              {selectedDiff && selectedDiff.added.length === 0 && selectedDiff.removed.length === 0 && selectedDiff.changed.length === 0 && (
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>Matches current live policies.</p>
              )}
              <pre style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(selected.snapshot, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
