import { getAccessToken, getSupabase } from './supabase'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export type FleetOrg = { org_id: string; org_name: string; role: string }

export async function fetchMyOrgs(): Promise<FleetOrg[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_my_orgs')
  if (error) return []
  return (data ?? []) as FleetOrg[]
}

async function fleetHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export type FleetRuntime = {
  id: string
  org_id: string
  name: string
  fingerprint: string
  mode: string
  status: string
  trust_score: number
  current_task: string | null
  active_model: string | null
  telemetry: Record<string, unknown>
  last_seen_at: string | null
}

export type FleetAgent = {
  id: string
  runtime_id: string
  agent_id: string
  model: string | null
  permissions: unknown[]
  status: string
  runtime_name?: string
  last_seen_at: string | null
}

export type FleetEvent = {
  id: string
  org_id: string
  runtime_id: string | null
  agent_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

function orgQuery(orgId?: string) {
  return orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
}

export async function fetchRuntimes(orgId?: string): Promise<FleetRuntime[]> {
  const res = await fetch(`${apiBase}/v1/runtimes${orgQuery(orgId)}`, {
    headers: await fleetHeaders(),
  })
  if (!res.ok) throw new Error(`Runtimes: ${res.status}`)
  return res.json() as Promise<FleetRuntime[]>
}

export async function fetchFleetAgents(): Promise<FleetAgent[]> {
  const res = await fetch(`${apiBase}/v1/agents`, { headers: await fleetHeaders() })
  if (!res.ok) throw new Error(`Agents: ${res.status}`)
  return res.json() as Promise<FleetAgent[]>
}

export async function fetchFleetEvents(limit = 50, orgId?: string): Promise<FleetEvent[]> {
  const org = orgId ? `&org_id=${encodeURIComponent(orgId)}` : ''
  const res = await fetch(`${apiBase}/v1/events?limit=${limit}${org}`, {
    headers: await fleetHeaders(),
  })
  if (!res.ok) throw new Error(`Events: ${res.status}`)
  return res.json() as Promise<FleetEvent[]>
}
