import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, KeyRound, RefreshCw, Shield, Wrench } from 'lucide-react'
import type { ActionPolicy, PolicyMap } from '@sanctum-runtime/sdk/browser'
import { api, policyToResponse, type PolicyResponse } from '../lib/api'
import { apiBaseUrl } from '../lib/api-url'
import { actionLabel } from '../lib/labels'
import { fetchMyOrgs } from '../lib/fleet'
import { getAccessToken } from '../lib/supabase'
import { formatApiError } from '../lib/sanitize-error'
import { EmptyState } from '../components/ui/EmptyState'
import type { PageId } from '../layout/Sidebar'

type AgentReg = {
  id: string
  name: string
  description?: string
  last_seen_at?: string
  actions_paused?: boolean
}

type Grant = {
  id: string
  action: string
  expires_at: string
  duration_minutes: number
}

type ConnectTool = {
  action: string
  platform: string | null
  seen_count: number
  last_seen_at: string
  agent_id: string | null
  suggestion: { recommendation: PolicyResponse; reason: string }
}

function policyActionKey(key: string): string {
  const idx = key.indexOf(':')
  return idx >= 0 ? key.slice(0, idx) : key
}

function responseBadge(response: PolicyResponse): string {
  if (response === 'block') return 'danger'
  if (response === 'verify') return 'warning'
  return 'success'
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function policyRows(policies: PolicyMap): Array<{ action: string; response: PolicyResponse; policy: ActionPolicy }> {
  return Object.entries(policies)
    .filter(([k]) => !k.startsWith('__'))
    .map(([key, policy]) => ({
      action: policyActionKey(key),
      response: policyToResponse(policy),
      policy,
    }))
    .sort((a, b) => a.action.localeCompare(b.action))
}

export function Permissions({ onPage }: { onPage?: (p: PageId) => void }) {
  const [orgId, setOrgId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [agents, setAgents] = useState<AgentReg[]>([])
  const [policies, setPolicies] = useState<PolicyMap>({})
  const [grants, setGrants] = useState<Grant[]>([])
  const [tools, setTools] = useState<ConnectTool[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyOrgs().then((orgs) => {
      if (orgs[0]) setOrgId(orgs[0].org_id)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const [agentRes, policyMap, toolsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, { headers }),
        api.getPolicies(orgId),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/tools`, { headers }),
      ])
      if (!agentRes.ok) throw new Error('Could not load agents')
      setAgents(await agentRes.json() as AgentReg[])
      setPolicies(policyMap)
      if (toolsRes.ok) {
        const d = await toolsRes.json() as { tools: ConnectTool[] }
        setTools(d.tools ?? [])
      } else {
        setTools([])
      }
    } catch (e) {
      setError(formatApiError(e, 'Failed to load permission graph'))
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!orgId || !agentId) {
      setGrants([])
      return
    }
    void (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/grants`, {
          headers: await authHeaders(),
        })
        if (res.ok) {
          const d = await res.json() as { grants: Grant[] }
          setGrants(d.grants ?? [])
        } else {
          setGrants([])
        }
      } catch {
        setGrants([])
      }
    })()
  }, [orgId, agentId])

  const selectedAgent = agents.find((a) => a.id === agentId)
  const rows = useMemo(() => policyRows(policies), [policies])
  const grantActions = useMemo(() => new Set(grants.map((g) => g.action)), [grants])
  const agentTools = useMemo(
    () => tools.filter((t) => !t.agent_id || t.agent_id === agentId),
    [tools, agentId],
  )

  const toolPolicy = (action: string): PolicyResponse | null => {
    const row = rows.find((r) => r.action === action)
    return row?.response ?? null
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Permission graph</h1>
          <p>What this agent can reach — org policies, time-bound grants, and Connect tools</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Refresh
          </button>
          {onPage && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('policies')}>Policies</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('connect')}>Connect</button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
          <div className="alert__body">{error}</div>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
          <option value="">Select an agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {!agentId ? (
        <EmptyState
          title="Select an agent"
          description="Choose a registered agent to see how org policies, grants, and Connect tools apply to what it can execute."
        >
          {onPage && agents.length === 0 && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => onPage('agents')}>
              Register an agent
            </button>
          )}
        </EmptyState>
      ) : (
        <div className="permission-graph">
          <section className="card permission-graph__node">
            <div className="permission-graph__node-head">
              <Bot size={18} aria-hidden />
              <h2>Agent</h2>
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
              <strong>{selectedAgent?.name}</strong>
              {selectedAgent?.actions_paused && (
                <span className="badge danger" style={{ marginLeft: '0.5rem' }}>Paused</span>
              )}
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              {selectedAgent?.last_seen_at
                ? `Last seen ${new Date(selectedAgent.last_seen_at).toLocaleString()}`
                : 'Never seen'}
            </p>
          </section>

          <div className="permission-graph__arrow" aria-hidden><ArrowRight size={20} /></div>

          <section className="card permission-graph__node permission-graph__node--wide">
            <div className="permission-graph__node-head">
              <Shield size={18} aria-hidden />
              <h2>Org policies ({rows.length})</h2>
            </div>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Default gate for each action before execution
            </p>
            {rows.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No org policies yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Mode</th>
                      <th>Grant bypass</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((row) => (
                      <tr key={row.action}>
                        <td>{actionLabel(row.action)}</td>
                        <td><span className={`badge ${responseBadge(row.response)}`}>{row.response}</span></td>
                        <td>{grantActions.has(row.action) ? <span className="badge success">Active grant</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > 20 && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Showing 20 of {rows.length}. Open Policies for the full list.
              </p>
            )}
          </section>

          <div className="permission-graph__arrow" aria-hidden><ArrowRight size={20} /></div>

          <section className="card permission-graph__node">
            <div className="permission-graph__node-head">
              <KeyRound size={18} aria-hidden />
              <h2>Active grants ({grants.length})</h2>
            </div>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Time-bound approvals that bypass hold for specific actions
            </p>
            {grants.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No active grants for this agent.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.82rem' }}>
                {grants.map((g) => (
                  <li key={g.id} style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                    <strong>{actionLabel(g.action)}</strong>
                    <span style={{ color: 'var(--muted)', marginLeft: '0.35rem' }}>
                      until {new Date(g.expires_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="permission-graph__arrow" aria-hidden><ArrowRight size={20} /></div>

          <section className="card permission-graph__node permission-graph__node--wide">
            <div className="permission-graph__node-head">
              <Wrench size={18} aria-hidden />
              <h2>Connect tools ({agentTools.length})</h2>
            </div>
            <p style={{ margin: '0 0 0.65rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Tools seen through the Connect proxy for this agent
            </p>
            {agentTools.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                No tools registered yet. Route tool calls through Connect to populate this graph.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Policy</th>
                      <th>Suggestion</th>
                      <th>Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentTools.slice(0, 15).map((t) => {
                      const pol = toolPolicy(t.action)
                      return (
                        <tr key={t.action}>
                          <td><code style={{ fontSize: '0.78rem' }}>{t.action}</code></td>
                          <td>
                            {pol
                              ? <span className={`badge ${responseBadge(pol)}`}>{pol}</span>
                              : <span className="badge neutral">default</span>}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.suggestion.reason}</td>
                          <td style={{ color: 'var(--muted)' }}>{t.seen_count}×</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
