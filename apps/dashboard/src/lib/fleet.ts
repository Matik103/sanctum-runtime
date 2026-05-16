import { getAccessToken } from './supabase'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

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

export async function fetchRuntimes(): Promise<FleetRuntime[]> {
  const res = await fetch(`${apiBase}/v1/runtimes`, { headers: await fleetHeaders() })
  if (!res.ok) throw new Error(`Runtimes: ${res.status}`)
  return res.json() as Promise<FleetRuntime[]>
}

export async function fetchFleetAgents(): Promise<FleetAgent[]> {
  const res = await fetch(`${apiBase}/v1/agents`, { headers: await fleetHeaders() })
  if (!res.ok) throw new Error(`Agents: ${res.status}`)
  return res.json() as Promise<FleetAgent[]>
}

export async function fetchFleetEvents(limit = 50): Promise<FleetEvent[]> {
  const res = await fetch(`${apiBase}/v1/events?limit=${limit}`, {
    headers: await fleetHeaders(),
  })
  if (!res.ok) throw new Error(`Events: ${res.status}`)
  return res.json() as Promise<FleetEvent[]>
}
