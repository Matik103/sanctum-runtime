import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
import type { RegisteredRuntime } from './control-plane-store.js'

export type DeploymentGroup = {
  id: string
  org_id: string
  name: string
  region: string | null
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type RuntimeCommand = {
  id: string
  org_id: string
  runtime_id: string | null
  deployment_group_id: string | null
  region: string | null
  command: string
  payload: Record<string, unknown>
  status: string
  created_at: string
}

export type FleetMapRegion = {
  region: string
  online: number
  offline: number
  total: number
  runtimes: { id: string; name: string; status: string; mode: string }[]
}

export type FleetMapGroup = {
  id: string
  name: string
  region: string | null
  online: number
  total: number
}

export type FleetMap = {
  summary: {
    runtimes: number
    online: number
    offline: number
    agents: number
    verified: number
  }
  regions: FleetMapRegion[]
  groups: FleetMapGroup[]
}

export class OrchestrationStore {
  constructor(private supabase: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.supabase)
  }

  async createDeploymentGroup(input: {
    orgId: string
    name: string
    region?: string
    description?: string
    metadata?: Record<string, unknown>
  }): Promise<DeploymentGroup> {
    const { data, error } = await this.admin()
      .from('deployment_groups')
      .upsert(
        {
          org_id: input.orgId,
          name: input.name,
          region: input.region ?? null,
          description: input.description ?? null,
          metadata: input.metadata ?? {},
        },
        { onConflict: 'org_id,name' },
      )
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as DeploymentGroup
  }

  async listDeploymentGroups(orgId: string): Promise<DeploymentGroup[]> {
    const { data, error } = await this.admin()
      .from('deployment_groups')
      .select('*')
      .eq('org_id', orgId)
      .order('name')
    if (error) throw new Error(error.message)
    return (data ?? []) as DeploymentGroup[]
  }

  async dispatchCommand(input: {
    orgId: string
    command: string
    payload?: Record<string, unknown>
    runtimeId?: string
    deploymentGroupId?: string
    region?: string
  }): Promise<{ commandIds: string[]; targetCount: number; wsDelivered: number }> {
    if (!input.runtimeId && !input.deploymentGroupId && !input.region) {
      throw new Error('dispatch_target_required')
    }

    const admin = this.admin()
    let runtimeIds: string[] = []

    if (input.runtimeId) {
      runtimeIds = [input.runtimeId]
    } else {
      let q = admin.from('registered_runtimes').select('id').eq('org_id', input.orgId)
      if (input.deploymentGroupId) q = q.eq('deployment_group_id', input.deploymentGroupId)
      if (input.region) q = q.eq('region', input.region)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      runtimeIds = (data ?? []).map((r: { id: string }) => r.id)
    }

    if (runtimeIds.length === 0) return { commandIds: [], targetCount: 0, wsDelivered: 0 }

    const rows = runtimeIds.map((runtimeId) => ({
      org_id: input.orgId,
      runtime_id: runtimeId,
      deployment_group_id: input.deploymentGroupId ?? null,
      region: input.region ?? null,
      command: input.command,
      payload: input.payload ?? {},
      status: 'pending',
    }))

    const { data, error } = await admin
      .from('runtime_commands')
      .insert(rows)
      .select('id, runtime_id')
    if (error) throw new Error(error.message)

    const now = new Date().toISOString()
    let wsDelivered = 0
    for (const row of data ?? []) {
      const pushed = runtimeWsHub.push(row.runtime_id as string, {
        type: 'command',
        id: row.id as string,
        command: input.command,
        payload: input.payload ?? {},
      })
      if (pushed) {
        wsDelivered++
        await admin
          .from('runtime_commands')
          .update({ status: 'delivered', delivered_at: now })
          .eq('id', row.id)
      }
    }

    return {
      commandIds: (data ?? []).map((r: { id: string }) => r.id),
      targetCount: runtimeIds.length,
      wsDelivered,
    }
  }

  async claimPendingCommands(runtimeId: string, limit = 10): Promise<RuntimeCommand[]> {
    if (runtimeWsHub.isConnected(runtimeId)) return []
    const admin = this.admin()
    const now = new Date().toISOString()
    const { data: pending, error } = await admin
      .from('runtime_commands')
      .select('*')
      .eq('runtime_id', runtimeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw new Error(error.message)
    if (!pending?.length) return []

    const ids = pending.map((c: { id: string }) => c.id)
    await admin
      .from('runtime_commands')
      .update({ status: 'delivered', delivered_at: now })
      .in('id', ids)

    return pending.map((c: RuntimeCommand) => ({ ...c, status: 'delivered', delivered_at: now }))
  }

  async ackCommand(commandId: string, runtimeId: string, ok = true): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await this.admin()
      .from('runtime_commands')
      .update({
        status: ok ? 'acked' : 'failed',
        acked_at: now,
      })
      .eq('id', commandId)
      .eq('runtime_id', runtimeId)
      .in('status', ['pending', 'delivered'])
    if (error) throw new Error(error.message)
  }

  buildFleetMap(
    runtimes: RegisteredRuntime[],
    groups: DeploymentGroup[],
    agentCount: number,
  ): FleetMap {
    const regionMap = new Map<string, FleetMapRegion>()
    const unassigned = 'unassigned'

    for (const r of runtimes) {
      const region = r.region?.trim() || (r.metadata?.region as string | undefined)?.trim() || unassigned
      let bucket = regionMap.get(region)
      if (!bucket) {
        bucket = { region, online: 0, offline: 0, total: 0, runtimes: [] }
        regionMap.set(region, bucket)
      }
      bucket.total++
      if (r.status === 'online') bucket.online++
      else bucket.offline++
      bucket.runtimes.push({
        id: r.id,
        name: r.name,
        status: r.status,
        mode: r.mode,
      })
    }

    const groupStats = groups.map((g) => {
      const members = runtimes.filter((r) => r.deployment_group_id === g.id)
      return {
        id: g.id,
        name: g.name,
        region: g.region,
        online: members.filter((r) => r.status === 'online').length,
        total: members.length,
      }
    })

    const verified = runtimes.filter(
      (r) => r.attestation_status === 'verified',
    ).length

    return {
      summary: {
        runtimes: runtimes.length,
        online: runtimes.filter((r) => r.status === 'online').length,
        offline: runtimes.filter((r) => r.status !== 'online').length,
        agents: agentCount,
        verified,
      },
      regions: [...regionMap.values()].sort((a, b) => a.region.localeCompare(b.region)),
      groups: groupStats.sort((a, b) => a.name.localeCompare(b.name)),
    }
  }
}
