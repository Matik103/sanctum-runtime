import { useCallback, useEffect, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { fetchMyOrgs } from '../lib/fleet'
import { RefreshCw, RotateCcw, Download, Wifi, WifiOff, Clock, AlertTriangle, Plug } from 'lucide-react'
import type { PageId } from '../layout/Sidebar'

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
  total24h: number
  blocked24h: number
  held24h: number
  worstShield?: 'clear' | 'elevated' | 'high' | 'critical'
}

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
    active: { label: 'Active',     color: 'var(--success)', icon: <Wifi size={11} /> },
    recent: { label: 'Recent',     color: '#f59e0b',        icon: <Clock size={11} /> },
    idle:   { label: 'Idle',       color: 'var(--muted)',   icon: <WifiOff size={11} /> },
    never:  { label: 'Never seen', color: 'var(--muted)',   icon: <WifiOff size={11} /> },
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

type Props = { onPage: (p: PageId) => void }

export function Agents({ onPage }: Props) {
  const [orgId, setOrgId] = useState('')
  const [agents, setAgents] = useState<AgentReg[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, AgentStats>>({})
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [rotating, setRotating] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null)
  const [rotatedToken, setRotatedToken] = useState<{ agentId: string; token: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  const load = useCallback(async (oid: string, withStats = false) => {
    if (!oid) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${oid}/agents`, { headers: await authHeaders() })
      if (!res.ok) { setError(`Failed to load agents: ${res.status}`); return }
      const data = await res.json() as AgentReg[]
      setAgents(data)
      if (withStats) {
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load(orgId, true) }, [load, orgId])

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
      setNewToken({ name: data.name, token: data.token })
      setName(''); setDesc('')
      await load(orgId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setCreating(false) }
  }

  const revoke = async (agentId: string, agentName: string) => {
    if (!confirm(`Revoke token for "${agentName}"? The agent will stop working immediately.`)) return
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      })
      if (!res.ok) { setError(`Revoke failed: ${res.status}`); return }
      await load(orgId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    }
  }

  const rotate = async (agentId: string) => {
    setRotating(agentId); setError(null)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/rotate`, {
        method: 'POST', headers: await authHeaders(),
      })
      if (!res.ok) { setError(`Rotation failed: ${res.status}`); return }
      const data = await res.json() as { token: string }
      setRotatedToken({ agentId, token: data.token })
      await load(orgId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Rotation failed') }
    finally { setRotating(null) }
  }

  const copyToken = (token: string, key: string) => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopiedId(key)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const downloadEnv = (token: string, agentName: string) => {
    const content = `# Sanctum agent credentials — ${agentName}\n# Generated ${new Date().toISOString()}\nSANCTUM_AGENT_TOKEN=${token}\nSANCTUM_API_URL=${apiBaseUrl}\n`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${agentName.replace(/\s+/g, '-')}.env`
    a.click(); URL.revokeObjectURL(url)
  }

  const tokenCard = (token: string, agentName: string, isRotation = false, cardKey: string) => (
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
          <button type="button" className="response-btn" onClick={() => copyToken(token, cardKey)} style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem' }}>
            {copiedId === cardKey ? '✓ Copied' : 'Copy token'}
          </button>
          <button type="button" className="response-btn" onClick={() => downloadEnv(token, agentName)} style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Download size={13} /> Download .env
          </button>
        </div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => { setNewToken(null); setRotatedToken(null) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>
          Dismiss
        </button>
        <button type="button" onClick={() => onPage('connect')} style={{ background: 'none', border: 'none', color: 'var(--accent, #6366f1)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plug size={12} /> Use with existing agent app →
        </button>
      </div>
    </div>
  )

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Agents</h1>
          <p>Register agents to get signed tokens — policies enforce automatically without self-reported org IDs</p>
        </div>
        <button type="button" className="response-btn" onClick={() => void load(orgId, true)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </header>

      {/* Token reveals */}
      {newToken && tokenCard(newToken.token, newToken.name, false, 'new')}
      {rotatedToken && (() => {
        const agent = agents.find(a => a.id === rotatedToken.agentId)
        return agent ? tokenCard(rotatedToken.token, agent.name, true, `rot-${rotatedToken.agentId}`) : null
      })()}

      {/* Register new agent */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>Register a new agent</p>
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
          {agents.map((a) => (
            <div key={a.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ margin: '0 0 0.2rem', fontWeight: 600, fontSize: '0.95rem' }}>{a.name}</p>
                {a.description && <p style={{ margin: '0 0 0.35rem', fontSize: '0.82rem', color: 'var(--muted)' }}>{a.description}</p>}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Token: <code style={{ fontSize: '0.72rem', color: 'var(--text)' }}>...{a.token_hint}</code>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Registered {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  <StatusBadge lastSeen={a.last_seen_at} />
                  <ThreatBadge stats={statsMap[a.id]} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button type="button" className="response-btn" disabled={rotating === a.id}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => void rotate(a.id)}>
                  <RotateCcw size={11} /> {rotating === a.id ? 'Rotating…' : 'Rotate'}
                </button>
                <button type="button" className="response-btn"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' }}
                  onClick={() => void revoke(a.id, a.name)}>
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
