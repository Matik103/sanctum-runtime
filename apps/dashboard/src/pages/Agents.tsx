import { useEffect, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { fetchMyOrgs } from '../lib/fleet'

type AgentReg = {
  id: string
  org_id: string
  name: string
  description?: string
  token_hint: string
  created_at: string
  last_seen_at?: string
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export function Agents() {
  const [orgId, setOrgId] = useState('')
  const [agents, setAgents] = useState<AgentReg[]>([])
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<{ name: string; token: string; hint: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  const load = async (oid = orgId) => {
    if (!oid) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${oid}/agents`, { headers: await authHeaders() })
      if (res.ok) setAgents(await res.json() as AgentReg[])
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [orgId])

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
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setCreating(false) }
  }

  const revoke = async (agentId: string, agentName: string) => {
    if (!confirm(`Revoke token for "${agentName}"? The agent will stop working immediately.`)) return
    await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    await load()
  }

  const copyToken = () => {
    if (!newToken) return
    void navigator.clipboard.writeText(newToken.token).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Agents</h1>
          <p>Register agents to get signed tokens — policies enforce automatically without self-reported org IDs</p>
        </div>
      </header>

      {/* New token reveal */}
      {newToken && (
        <div className="card" style={{ marginBottom: '1.25rem', borderLeft: '3px solid var(--success)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--success)' }}>
            ✓ Agent registered: {newToken.name}
          </p>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#fca5a5', fontWeight: 500 }}>
            Copy this token now — it will not be shown again.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 200px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '0.65rem 0.85rem', borderRadius: 8, wordBreak: 'break-all', color: 'var(--text)', fontFamily: 'monospace' }}>
              {newToken.token}
            </code>
            <button type="button" className="response-btn" onClick={copyToken} style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.5rem 1rem' }}>
              {copied ? '✓ Copied' : 'Copy token'}
            </button>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.65 }}>
            <p style={{ margin: '0 0 0.4rem', fontWeight: 600, color: 'var(--text)' }}>Add to your agent:</p>
            <code style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--text)' }}>
              {'// Pass in every verifyAction call header'}<br />
              {'X-Agent-Token: ' + newToken.token}<br />
              <br />
              {'// Or in Authorization header'}<br />
              {'Authorization: Agent ' + newToken.token}<br />
              <br />
              {'// SDK example'}<br />
              {'await runtime.verifyAction({'}<br />
              {'  actor: \'my-agent\','}<br />
              {'  action: \'delete_file\','}<br />
              {'  context: { path: \'/data/report.csv\' },'}<br />
              {'  headers: { \'X-Agent-Token\': token },'}<br />
              {'})'}
            </code>
          </div>
          <button type="button" onClick={() => setNewToken(null)} style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      )}

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
              <div>
                <p style={{ margin: '0 0 0.2rem', fontWeight: 600, fontSize: '0.95rem' }}>{a.name}</p>
                {a.description && <p style={{ margin: '0 0 0.35rem', fontSize: '0.82rem', color: 'var(--muted)' }}>{a.description}</p>}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Token: <code style={{ fontSize: '0.72rem', color: 'var(--text)' }}>...{a.token_hint}</code>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Registered {new Date(a.created_at).toLocaleDateString()}
                  </span>
                  {a.last_seen_at && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                      Last seen {new Date(a.last_seen_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="response-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)', flexShrink: 0 }}
                onClick={() => void revoke(a.id, a.name)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
