import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

export type ConnectAgentRegistration = {
  id: string
  org_id: string
  name: string
  description?: string | null
  token_hint: string
  created_at: string
  last_seen_at?: string | null
  actions_paused?: boolean
  actions_paused_at?: string | null
  actions_paused_by?: string | null
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export async function fetchConnectAgents(orgId: string): Promise<ConnectAgentRegistration[]> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, { headers: await authHeaders() })
  if (!res.ok) return []
  return res.json() as Promise<ConnectAgentRegistration[]>
}

export async function pauseConnectAgent(orgId: string, agentId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/pause`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: '{}',
  })
  if (!res.ok) throw new Error(`pause_agent_${res.status}`)
}

export async function resumeConnectAgent(orgId: string, agentId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents/${agentId}/resume`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: '{}',
  })
  if (!res.ok) throw new Error(`resume_agent_${res.status}`)
}

export async function fetchHeldConnectCount(orgId: string): Promise<number> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/held-count`, {
    headers: await authHeaders(),
  })
  if (!res.ok) return 0
  const data = (await res.json()) as { held?: number }
  return data.held ?? 0
}
