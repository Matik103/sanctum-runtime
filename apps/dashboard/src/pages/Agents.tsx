import { useCallback, useEffect, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { fetchMyOrgs } from '../lib/fleet'
import { AgentConnectStudio } from '../components/AgentConnectStudio'
import { AgentDetail } from './AgentDetail'
import { RefreshCw, RotateCcw, Download, Wifi, WifiOff, Clock, AlertTriangle } from 'lucide-react'

type AgentReg = {
  id: string
  org_id: string
  name: string
  description?: string
  token_hint: string
  created_at: string
  last_seen_at?: string
}

type AgentStats = {
  blocked24h: number
  held24h: number
  approved24h: number
  total24h: number
  worstShield: string | null
  maxScore: number
}

type OrgOption = { org_id: string; org_name?: string }

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function agentStatus(lastSeen?: string): 'active' | 'recent' | 'idle' | 'never' {
  if (!lastSeen) return 'never'
  const ago = Date.now() - new Date(lastSeen).getTime()
  if (ago < 5 * 60_000) return 'active'
  if (ago < 60 * 60_000) return 'recent'
  return 'idle'
}

function StatusBadge({ lastSeen }: { lastSeen?: string }) {
  const status = agentStatus(lastSeen)
  const config = {
    active: { label: 'Active', color: 'var(--success)', icon: <Wifi size={11} /> },
    recent: { label: 'Recent', color: '#f59e0b', icon: <Clock size={11} /> },
    idle: { label: 'Idle', color: 'var(--muted)', icon: <WifiOff size={11} /> },
    never: { label: 'Never seen', color: 'var(--muted)', icon: <WifiOff size={11} /> },
  }[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: config.color, fontWeight: 500 }}>
      {config.icon} {config.label}
    </span>
  )
}

function ThreatBadge({ stats }: { stats?: AgentStats }) {
  if (!stats || stats.total24h === 0) return null
  const level = stats.worstShield
  if (!level || level === 'clear') {
    if (stats.blocked24h === 0 && stats.held24h === 0) return null
  }
  const color = level === 'critical' ? '#ef4444' : level === 'high' ? '#f97316' : level === 'elevated' ? '#f59e0b' : '#6b7280'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color, fontWeight: 500 }}>
      <AlertTriangle size={11} />
      {stats.blocked24h > 0 && `${stats.blocked24h} blocked`}
      {stats.blocked24h > 0 && stats.held24h > 0 && ' · '}
      {stats.held24h > 0 && `${stats.held24h} held`}
      {' · 24h'}
    </span>
  )
}

function agentTrustScore(stats?: AgentStats): number {
  if (!stats || stats.total24h === 0) return 100
  const blockedPenalty = stats.blocked24h * 16
  const heldPenalty = stats.held24h * 8
  const shieldPenalty = Math.round((stats.maxScore ?? 0) * 0.35)
  const approvalCredit = Math.min(8, stats.approved24h)
  return Math.max(0, Math.min(100, 100 - blockedPenalty - heldPenalty - shieldPenalty + approvalCredit))
}

function AgentTrustBadge({ stats }: { stats?: AgentStats }) {
  const score = agentTrustScore(stats)
  const color = score >= 85 ? 'var(--success)' : score >= 65 ? '#f59e0b' : '#ef4444'
  return (
    <span
      title="Computed from the last 24h of blocked, held, approved, and Shield-scored actions"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: '0.72rem',
        color,
        fontWeight: 600,
      }}
    >
      Trust {score}%
    </span>
  )
}

type Props = { onOpenDevices: () => void }

export function Agents({ onOpenDevices }: Props) {
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [orgId, setOrgId] = useState('')
  const [agents, setAgents] = useState<AgentReg[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, AgentStats>>({})
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<{ name: string; token: string; hint: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentReg | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [rotating, setRotating] = useState<string | null>(null)
  const [rotatedToken, setRotatedToken] = useState<{ agentId: string; token: string } | null>(null)

  useEffect(() => {
    fetchMyOrgs().then((list) => {
      setOrgs(list.map((o) => ({ org_id: o.org_id, org_name: o.org_name })))
      if (list[0]) setOrgId(list[0].org_id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async (oid: string) => {
    if (!oid) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${oid}/agents`, { headers: await authHeaders() })
      if (!res.ok) { setError(`Failed to load agents: ${res.status}`); return }
      const data = await res.json() as AgentReg[]
      setAgents(data)
      // Load stats for each agent in parallel (best-effort)
      const statsResults = await Promise.allSettled(
        data.map(async (a) => {
          const r = await fetch(`${apiBaseUrl}/v1/orgs/${oid}/agents/${a.id}/stats`, { headers: await authHeaders() })
          if (!r.ok) return null
          return { id: a.id, stats: await r.json() as AgentStats }
        })
      )
      const map: Record<string, AgentStats> = {}
      for (const result of statsResults) {
        if (result.status === 'fulfilled' && result.value) {
          map[result.value.id] = result.value.stats
        }
      }
      setStatsMap(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(orgId) }, [load, orgId])

  const create = async () => {
    if (!name.trim() || !orgId) { setError('Enter an agent name'); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }),
      })
      if (!res.ok) { setError(`Failed: ${res.status}`); return }
      const data = await res.json() as { token: string; name: string; token_hint: string }
      setNewToken({ name: data.name, token: data.token, hint: data.token_hint })
      setName(''); setDesc('')
      await load(orgId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setCreating(false) }
  }

  const revoke = async (agentId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}`, {
        method: 'DELETE', headers: await authHeaders(),
      })
      if (!res.ok) { setError(`Revoke failed: ${res.status}`); return }
      setConfirmRevoke(null)
      if (selectedAgent?.id === agentId) setSelectedAgent(null)
      await load(orgId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Revoke failed') }
  }

  const rotate = async (agentId: string) => {
    setRotating(agentId); setError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/rotate`, {
        method: 'POST', headers: await authHeaders(),
      })
      if (!res.ok) { setError(`Rotation failed: ${res.status}`); return }
      const data = await res.json() as { token: string; token_hint: string }
      setRotatedToken({ agentId, token: data.token })
      await load(orgId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Rotation failed') }
    finally { setRotating(null) }
  }

  const copyToken = (token: string) => {
    void navigator.clipboard.writeText(token).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const downloadEnv = (token: string, agentName: string) => {
    const content = `# Sanctum agent credentials — ${agentName}\n# Generated ${new Date().toISOString()}\nSANCTUM_AGENT_TOKEN=${token}\nSANCTUM_API_URL=${apiBaseUrl}\n`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${agentName.replace(/\s+/g, '-')}.env`
    a.click(); URL.revokeObjectURL(url)
  }

  const tokenCard = (token: string, agentName: string, hint: string, isRotation = false) => (
    <div className="card" style={{ marginBottom: '1.25rem', borderLeft: `3px solid ${isRotation ? '#f59e0b' : 'var(--success)'}` }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600, color: isRotation ? '#f59e0b' : 'var(--success)' }}>
        {isRotation ? `↻ Token rotated: ${agentName}` : `✓ Agent registered: ${agentName}`}
      </p>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#fca5a5', fontWeight: 500 }}>
        Copy this token now — it will not be shown again.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ flex: '1 1 200px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '0.65rem 0.85rem', borderRadius: 8, wordBreak: 'break-all', color: 'var(--text)', fontFamily: 'monospace' }}>
          {token}
        </code>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button type="button" className="response-btn" onClick={() => copyToken(token)} style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem' }}>
            {copied ? '✓ Copied' : 'Copy token'}
          </button>
          <button type="button" className="response-btn" onClick={() => downloadEnv(token, agentName)} style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={13} /> Download .env
          </button>
        </div>
      </div>
      <button type="button" onClick={() => { setNewToken(null); setRotatedToken(null) }} style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
        Dismiss
      </button>
    </div>
  )

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Agents</h1>
          <p>Register agents to get signed tokens — policies enforce automatically without self-reported org IDs</p>
        </div>
        {orgs.length > 1 && (
          <select
            value={orgId}
            onChange={(e) => { setOrgId(e.target.value); setSelectedAgent(null) }}
            style={{ padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem' }}
          >
            {orgs.map((o) => (
              <option key={o.org_id} value={o.org_id}>{o.org_name ?? o.org_id}</option>
            ))}
          </select>
        )}
      </header>

      {/* Zero-install callout */}
      <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--primary, #6366f1)', padding: '0.75rem 1rem' }}>
        <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
          🌐 No installation required
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.55 }}>
          Any agent — on any device, language, or platform — can connect directly via HTTP using an agent token and one POST request to <code style={{ fontSize: '0.77rem' }}>{apiBaseUrl}/v1/actions/verify</code>. No SDK, no local runtime, no npm install. Mobile users can monitor live in this dashboard.
        </p>
      </div>

      {/* Token reveals */}
      {newToken && tokenCard(newToken.token, newToken.name, newToken.hint)}
      {rotatedToken && (() => {
        const agent = agents.find(a => a.id === rotatedToken.agentId)
        return agent ? tokenCard(rotatedToken.token, agent.name, '', true) : null
      })()}

      {/* Register new agent */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', fontWeight: 600 }}>Register a new agent</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <input className="input" placeholder="Agent name (e.g. document-processor)" value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
            style={{ flex: '2 1 180px', boxSizing: 'border-box' }} />
          <input className="input" placeholder="Description (optional)" value={desc}
            onChange={(e) => setDesc(e.target.value)}
            style={{ flex: '3 1 220px', boxSizing: 'border-box' }} />
          <button type="button" className="response-btn active approve" disabled={creating} onClick={() => void create()}
            style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}>
            {creating ? 'Creating…' : 'Register agent'}
          </button>
        </div>
        {error && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>{error}</p>}
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Each registered agent gets a signed token. The API extracts the org ID from the token — the agent never self-reports it, eliminating org impersonation risk.
        </p>
      </div>

      <AgentConnectStudio agentToken={newToken} orgId={orgId} onOpenDevices={onOpenDevices} />

      {/* Agent list */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p>
      ) : agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>No agents registered yet</p>
          <p style={{ fontSize: '0.82rem' }}>Register your first agent above to get a signed token.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>{agents.length} agent{agents.length !== 1 ? 's' : ''}</strong>
            <button type="button" onClick={() => void load(orgId)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {agents.map((a) => (
            <div key={a.id}>
              <div
                className="card"
                style={{ cursor: 'pointer', borderLeft: selectedAgent?.id === a.id ? '3px solid var(--primary, #6366f1)' : undefined }}
                onClick={() => setSelectedAgent(selectedAgent?.id === a.id ? null : a)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>{a.name}</p>
                      <StatusBadge lastSeen={a.last_seen_at} />
                      <AgentTrustBadge stats={statsMap[a.id]} />
                      <ThreatBadge stats={statsMap[a.id]} />
                    </div>
                    {a.description && <p style={{ margin: '0 0 0.35rem', fontSize: '0.82rem', color: 'var(--muted)' }}>{a.description}</p>}
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Token: <code style={{ fontSize: '0.72rem', color: 'var(--text)' }}>...{a.token_hint}</code>
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Registered {new Date(a.created_at).toLocaleDateString()}
                      </span>
                      {a.last_seen_at && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          Last seen {new Date(a.last_seen_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="response-btn"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: 4 }}
                      disabled={rotating === a.id}
                      onClick={(e) => { e.stopPropagation(); void rotate(a.id) }}
                      title="Rotate token — invalidates the current token and issues a new one"
                    >
                      <RotateCcw size={12} /> {rotating === a.id ? 'Rotating…' : 'Rotate'}
                    </button>
                    {confirmRevoke === a.id ? (
                      <div style={{ display: 'flex', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="response-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => void revoke(a.id)}>Confirm revoke</button>
                        <button type="button" className="response-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                          onClick={() => setConfirmRevoke(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="response-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)', flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); setConfirmRevoke(a.id) }}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {selectedAgent?.id === a.id && (
                <AgentDetail
                  agentId={a.id}
                  agentName={a.name}
                  orgId={orgId}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
