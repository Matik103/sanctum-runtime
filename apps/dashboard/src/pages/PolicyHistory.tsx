import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw, Tag } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { Alert } from '../components/ui/Alert'
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

export function PolicyHistory() {
  const [orgId, setOrgId] = useState('')
  const [snapshots, setSnapshots] = useState<PolicySnapshot[]>([])
  const [selected, setSelected] = useState<PolicySnapshot | null>(null)
  const [label, setLabel] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const [showSave, setShowSave] = useState(false)

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

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
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setMsg({ text: 'Snapshot saved.', variant: 'success' })
      setLabel('')
      setSummary('')
      setShowSave(false)
      await load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const restore = async (snapshotId: string) => {
    if (!orgId || !confirm('Restore policies to this snapshot? Current policies will be overwritten.')) return
    setBusy(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/policy-snapshots/${snapshotId}/restore`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      setMsg({ text: 'Policies restored to snapshot.', variant: 'success' })
      setSelected(null)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const policyCount = (snap: PolicySnapshot) => Object.keys(snap.snapshot).length

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Policy History</h1>
          <p>Version-controlled policy snapshots with one-click rollback</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowSave(true)}>
          <Tag size={14} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
          Save snapshot
        </button>
      </header>

      {msg && (
        <Alert variant={msg.variant} onDismiss={() => setMsg(null)} style={{ marginBottom: '1rem' }}>
          {msg.text}
        </Alert>
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
