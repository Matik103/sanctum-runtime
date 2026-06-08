import { getAccessToken, getSupabase } from './supabase'
import { throwResponseError } from './sanitize-error'

import { apiBaseUrl as apiBase } from './api-url'

export type FleetOrg = { org_id: string; org_name: string; role: string }

type OperatorContext = {
  defaultOrganizationId: string | null
  organizationIds: string[]
}

async function fetchOperatorOrgs(): Promise<FleetOrg[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${apiBase}/v1/operator/context`, { headers })
  if (!res.ok) return []
  const ctx = (await res.json()) as OperatorContext
  const ids = ctx.organizationIds?.length
    ? ctx.organizationIds
    : ctx.defaultOrganizationId
      ? [ctx.defaultOrganizationId]
      : []

  return ids.map((org_id, idx) => ({
    org_id,
    org_name: idx === 0 ? 'Workspace' : `Workspace ${idx + 1}`,
    role: 'operator',
  }))
}

/** Membership from Supabase only — no API side effects (use before enterprise gate). */
export async function fetchMyOrgsFromDb(): Promise<FleetOrg[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.rpc('get_my_orgs')
  if (error) return []
  return (data ?? []) as FleetOrg[]
}

export async function fetchMyOrgs(): Promise<FleetOrg[]> {
  const rpcOrgs = await fetchMyOrgsFromDb()

  const apiOrgs = await fetchOperatorOrgs().catch(() => [])
  if (apiOrgs.length === 0) return rpcOrgs

  const byId = new Map(rpcOrgs.map((o) => [o.org_id, o]))
  return apiOrgs.map((o) => {
    const fromRpc = byId.get(o.org_id)
    return {
      org_id: o.org_id,
      org_name: fromRpc?.org_name ?? o.org_name,
      // Operator context has no roles — use membership role from Supabase when available.
      role: fromRpc?.role ?? (o.org_id.startsWith('personal-') ? 'owner' : 'member'),
    }
  })
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
  attestation_status: 'verified' | 'unverified' | 'limited'
  attestation_report?: Record<string, unknown>
  attested_at: string | null
  region: string | null
  deployment_group_id: string | null
  current_task: string | null
  active_model: string | null
  metadata: Record<string, unknown>
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
  if (!res.ok) await throwResponseError(res, 'Could not load runtimes')
  return res.json() as Promise<FleetRuntime[]>
}

export async function fetchFleetAgents(orgId?: string): Promise<FleetAgent[]> {
  const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
  const res = await fetch(`${apiBase}/v1/agents${q}`, { headers: await fleetHeaders() })
  if (!res.ok) await throwResponseError(res, 'Could not load agents')
  return res.json() as Promise<FleetAgent[]>
}

export type FleetMap = {
  summary: {
    runtimes: number
    online: number
    offline: number
    agents: number
    verified: number
  }
  regions: {
    region: string
    online: number
    offline: number
    total: number
    runtimes: { id: string; name: string; status: string; mode: string }[]
  }[]
  groups: { id: string; name: string; region: string | null; online: number; total: number }[]
}

export async function fetchFleetMap(orgId: string): Promise<FleetMap> {
  const res = await fetch(`${apiBase}/v1/fleet/map?org_id=${encodeURIComponent(orgId)}`, {
    headers: await fleetHeaders(),
  })
  if (!res.ok) await throwResponseError(res, 'Fleet map is unavailable')
  return res.json() as Promise<FleetMap>
}

export type DeploymentGroup = {
  id: string
  org_id: string
  name: string
  region: string | null
  description: string | null
  metadata: Record<string, unknown>
}

export async function fetchDeploymentGroups(orgId: string): Promise<DeploymentGroup[]> {
  const res = await fetch(
    `${apiBase}/v1/deployment-groups?org_id=${encodeURIComponent(orgId)}`,
    { headers: await fleetHeaders() },
  )
  if (!res.ok) await throwResponseError(res, 'Deployment groups are unavailable')
  return res.json() as Promise<DeploymentGroup[]>
}

export async function createDeploymentGroup(input: {
  organizationId: string
  name: string
  region?: string
  description?: string
}): Promise<DeploymentGroup> {
  const res = await fetch(`${apiBase}/v1/deployment-groups`, {
    method: 'POST',
    headers: await fleetHeaders(),
    body: JSON.stringify({
      organizationId: input.organizationId,
      name: input.name,
      region: input.region,
      description: input.description,
    }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not create deployment group')
  const data = (await res.json()) as { group: DeploymentGroup }
  return data.group
}

export async function updateRuntimePlacement(
  runtimeId: string,
  patch: { deploymentGroupId?: string | null; region?: string | null },
): Promise<void> {
  const res = await fetch(`${apiBase}/v1/runtimes/${runtimeId}/placement`, {
    method: 'PATCH',
    headers: await fleetHeaders(),
    body: JSON.stringify({
      deploymentGroupId: patch.deploymentGroupId,
      region: patch.region,
    }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not update runtime placement')
}

export async function dispatchFleetCommand(input: {
  organizationId: string
  command: string
  payload?: Record<string, unknown>
  region?: string
  deploymentGroupId?: string
  runtimeId?: string
}): Promise<{ commandIds: string[]; targetCount: number; wsDelivered?: number }> {
  const res = await fetch(`${apiBase}/v1/orchestration/dispatch`, {
    method: 'POST',
    headers: await fleetHeaders(),
    body: JSON.stringify({
      organizationId: input.organizationId,
      command: input.command,
      payload: input.payload ?? {},
      region: input.region,
      deploymentGroupId: input.deploymentGroupId,
      runtimeId: input.runtimeId,
    }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not dispatch fleet command')
  return res.json() as Promise<{ commandIds: string[]; targetCount: number; wsDelivered?: number }>
}

export async function fetchFleetEvents(limit = 50, orgId?: string): Promise<FleetEvent[]> {
  const org = orgId ? `&org_id=${encodeURIComponent(orgId)}` : ''
  const res = await fetch(`${apiBase}/v1/events?limit=${limit}${org}`, {
    headers: await fleetHeaders(),
  })
  if (!res.ok) await throwResponseError(res, 'Could not load fleet events')
  return res.json() as Promise<FleetEvent[]>
}
