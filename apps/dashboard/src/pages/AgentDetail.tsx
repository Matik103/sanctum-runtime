import { useCallback, useEffect, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { responseError, formatApiError } from '../lib/sanitize-error'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { useConfirmDialog } from '../hooks/useConfirmDialog'
import { HELD_DECISION_LABEL } from '../lib/labels'
import { Shield, Clock, CheckCircle, XCircle, Plus } from 'lucide-react'

type AuditEntry = {
  id: string
  actor: string
  action: string
  decision: string
  risk: string
  shield_level: string | null
  shield_score: number | null
  created_at: string
}

type Grant = {
  id: string
  action: string
  actor: string | null
  granted_by: string
  duration_minutes: number
  expires_at: string
  created_at: string
}

type Stats = {
  blocked24h: number
  held24h: number
  approved24h: number
  total24h: number
  worstShield: string | null
  maxScore: number
  trustScore: number | null
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function decisionColor(d: string) {
  if (d === 'APPROVED') return 'var(--success)'
  if (d === 'BLOCKED') return '#ef4444'
  return '#f59e0b'
}

function decisionLabelLocal(d: string) {
  if (d === 'APPROVED') return 'Approved'
  if (d === 'BLOCKED') return 'Blocked'
  return HELD_DECISION_LABEL
}

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type Props = { agentId: string; agentName: string; orgId: string }

export function AgentDetail({ agentId, agentName, orgId }: Props) {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'activity' | 'grants'>('activity')
  const [grantAction, setGrantAction] = useState('')
  const [grantDuration, setGrantDuration] = useState(60)
  const [creatingGrant, setCreatingGrant] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [auditRes, grantsRes, statsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/audit?limit=50`, { headers: await authHeaders() }),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/grants`, { headers: await authHeaders() }),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/stats`, { headers: await authHeaders() }),
      ])
      if (auditRes.ok) {
        const d = await auditRes.json() as { entries: AuditEntry[] }
        setAudit(d.entries)
      }
      if (grantsRes.ok) {
        const d = await grantsRes.json() as { grants: Grant[] }
        setGrants(d.grants)
      }
      if (statsRes.ok) {
        setStats(await statsRes.json() as Stats)
      }
    } finally { setLoading(false) }
  }, [agentId, orgId])

  useEffect(() => { void load() }, [load])

  const createGrant = async () => {
    if (!grantAction.trim()) { setGrantError('Enter an action name'); return }
    setCreatingGrant(true); setGrantError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/grants`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ action: grantAction.trim(), durationMinutes: grantDuration }),
      })
      if (!res.ok) { setGrantError((await responseError(res, 'Could not update the grant')).message); return }
      setGrantAction('')
      await load()
    } catch (e) { setGrantError(formatApiError(e, 'Failed')) }
    finally { setCreatingGrant(false) }
  }

  const revokeGrant = async (grantId: string, action: string) => {
    const ok = await confirm({
      title: 'Revoke time-bound grant?',
      message: `Remove the grant for "${action.replace(/_/g, ' ')}".`,
      confirmLabel: 'Revoke grant',
      variant: 'warn',
      impact: [
        'The agent will need approval again for this action',
        'Existing held actions are not auto-approved',
      ],
    })
    if (!ok) return
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/grants/${grantId}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      })
      if (!res.ok) { setGrantError((await responseError(res, 'Could not revoke grant')).message); return }
      await load()
    } catch (e) { setGrantError(formatApiError(e, 'Failed to revoke grant')) }
  }

  const shieldColor = (level: string | null) => {
    if (level === 'critical') return '#ef4444'
    if (level === 'high') return '#f97316'
    if (level === 'elevated') return '#f59e0b'
    return 'var(--muted)'
  }

  return (
    <>
      <ConfirmDialog />
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '1rem' }}>
      {/* Stats strip */}
      {stats && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text)' }}>{stats.total24h}</strong> actions (24h)
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>
            <CheckCircle size={12} style={{ verticalAlign: 'middle' }} /> {stats.approved24h} approved
          </span>
          {stats.held24h > 0 && (
            <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
              <Clock size={12} style={{ verticalAlign: 'middle' }} /> {stats.held24h} held
            </span>
          )}
          {stats.blocked24h > 0 && (
            <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>
              <XCircle size={12} style={{ verticalAlign: 'middle' }} /> {stats.blocked24h} blocked
            </span>
          )}
          {stats.trustScore != null && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
              Behavioral health: <strong>{stats.trustScore}%</strong>
            </span>
          )}
          {stats.worstShield && stats.worstShield !== 'clear' && (
            <span style={{ fontSize: '0.8rem', color: shieldColor(stats.worstShield) }}>
              <Shield size={12} style={{ verticalAlign: 'middle' }} /> Shield: {stats.worstShield} (max {stats.maxScore}/100)
            </span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        {(['activity', 'grants'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--text)' : 'var(--muted)', borderBottom: tab === t ? '2px solid var(--primary, #6366f1)' : '2px solid transparent', paddingBottom: '0.25rem', textTransform: 'capitalize' }}>
            {t === 'activity' ? `Activity${audit.length ? ` (${audit.length})` : ''}` : `Grants${grants.length ? ` (${grants.length})` : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Loading…</p>
      ) : tab === 'activity' ? (
        audit.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No actions recorded for <strong>{agentName}</strong> yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {audit.map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 7, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.action}</span>
                  {e.shield_level && e.shield_level !== 'clear' && (
                    <span style={{ fontSize: '0.72rem', color: shieldColor(e.shield_level) }}>
                      <Shield size={10} style={{ verticalAlign: 'middle' }} /> Shield {e.shield_level}
                      {e.shield_score != null && ` · score ${e.shield_score}`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: decisionColor(e.decision) }}>{decisionLabelLocal(e.decision)}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{timeAgo(e.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          {/* Create grant form */}
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', fontWeight: 600 }}>Grant time-bounded approval</p>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Allows <strong>{agentName}</strong> to perform a specific action repeatedly for the duration without re-asking.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <input className="input" placeholder="Action (e.g. send_email)" value={grantAction}
                onChange={(e) => { setGrantAction(e.target.value); setGrantError(null) }}
                style={{ flex: '3 1 160px', boxSizing: 'border-box', fontSize: '0.82rem' }} />
              <select value={grantDuration} onChange={(e) => setGrantDuration(Number(e.target.value))}
                style={{ flex: '1 1 120px', padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem', boxSizing: 'border-box' }}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
                <option value={480}>8 hours</option>
                <option value={1440}>24 hours</option>
              </select>
              <button type="button" className="response-btn active approve" disabled={creatingGrant} onClick={() => void createGrant()}
                style={{ fontSize: '0.82rem', padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Plus size={13} /> {creatingGrant ? 'Creating…' : 'Grant'}
              </button>
            </div>
            {grantError && (
              <PlanGateAlert message={grantError} onDismiss={() => setGrantError(null)} style={{ marginTop: '0.4rem' }} />
            )}
          </div>

          {/* Active grants list */}
          {grants.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>No active grants for {agentName}.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {grants.map((g) => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 7, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{g.action}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>by {g.granted_by} · {g.duration_minutes}m</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> expires {new Date(g.expires_at).toLocaleTimeString()}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void revokeGrant(g.id, g.action)}>Revoke</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}
