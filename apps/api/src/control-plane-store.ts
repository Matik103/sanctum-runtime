import { createHash, randomBytes } from 'node:crypto'
import { ChallengeStore } from './challenge-store.js'
import { evaluateAndTokenize, type AttestationReport } from './attestation.js'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { queryWithTimeout, SUPABASE_ROW_LIMITS } from './supabase-limits.js'
import { recordUsage, UsageMetrics } from './usage-store.js'

export type RuntimeMode = 'cloud' | 'edge' | 'airgap' | 'hybrid'

export type RegisteredRuntime = {
  id: string
  org_id: string
  name: string
  fingerprint: string
  mode: RuntimeMode
  status: 'online' | 'offline' | 'degraded'
  trust_score: number
  attestation_status: 'verified' | 'unverified' | 'limited'
  attestation_report: Record<string, unknown>
  attestation_token: string | null
  attested_at: string | null
  deployment_group_id: string | null
  region: string | null
  current_task: string | null
  active_model: string | null
  metadata: Record<string, unknown>
  telemetry: Record<string, unknown>
  connected_at: string | null
  last_seen_at: string | null
  created_at: string
}

export type RegisteredAgent = {
  id: string
  runtime_id: string
  agent_id: string
  model: string | null
  permissions: unknown[]
  status: string
  metadata: Record<string, unknown>
  last_seen_at: string | null
}

export type RuntimeEvent = {
  id: string
  org_id: string
  runtime_id: string | null
  agent_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export function defaultFingerprint(): string {
  const raw = `${process.env.HOSTNAME ?? 'host'}:${process.pid}:${randomBytes(8).toString('hex')}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export class ControlPlaneStore {
  private challenges: ChallengeStore

  private _admin: ReturnType<typeof createSupabaseAdmin>

  constructor(private supabase: SupabaseAuthConfig) {
    this.challenges = new ChallengeStore(supabase)
    this._admin = createSupabaseAdmin(supabase)
  }

  private admin() {
    return this._admin
  }

  async ensureOrg(orgId: string, name?: string) {
    const admin = this.admin()
    await admin.from('organizations').upsert({
      id: orgId,
      name: name ?? orgId,
    })
  }

  async connectRuntime(input: {
    orgId: string
    name: string
    fingerprint: string
    mode: RuntimeMode
    metadata?: Record<string, unknown>
    telemetry?: Record<string, unknown>
    activeModel?: string
    currentTask?: string
    attestationReport?: AttestationReport
    deploymentGroupId?: string
    region?: string
  }): Promise<RegisteredRuntime> {
    await this.ensureOrg(input.orgId)
    const now = new Date().toISOString()
    const admin = this.admin()

    const { data: existing } = await admin
      .from('registered_runtimes')
      .select('*')
      .eq('org_id', input.orgId)
      .eq('fingerprint', input.fingerprint)
      .maybeSingle()

    const region =
      input.region?.trim() ||
      (typeof input.metadata?.region === 'string' ? input.metadata.region.trim() : null) ||
      null

    const row = {
      org_id: input.orgId,
      name: input.name,
      fingerprint: input.fingerprint,
      mode: input.mode,
      status: 'online' as const,
      metadata: input.metadata ?? {},
      telemetry: input.telemetry ?? {},
      active_model: input.activeModel ?? null,
      current_task: input.currentTask ?? null,
      deployment_group_id: input.deploymentGroupId ?? null,
      region,
      connected_at: existing?.connected_at ?? now,
      last_seen_at: now,
    }

    const { data, error } = await admin
      .from('registered_runtimes')
      .upsert(row, { onConflict: 'org_id,fingerprint' })
      .select('*')
      .single()

    if (error) throw new Error(error.message)

    const att = await evaluateAndTokenize(data.id as string, {
      mode: input.mode,
      fingerprint: input.fingerprint,
      report: input.attestationReport,
      challengeStore: this.challenges,
    })

    const { data: attested, error: attErr } = await admin
      .from('registered_runtimes')
      .update({
        trust_score: att.trustScore,
        attestation_status: att.status,
        attestation_report: { ...att.report, reasons: att.reasons },
        attestation_token: att.token,
        attested_at: now,
      })
      .eq('id', data.id)
      .select('*')
      .single()

    if (attErr) throw new Error(attErr.message)

    await this.insertEvent({
      orgId: input.orgId,
      runtimeId: data.id,
      eventType: 'runtime.connected',
      payload: { name: input.name, mode: input.mode, fingerprint: input.fingerprint },
    })
    await this.insertEvent({
      orgId: input.orgId,
      runtimeId: data.id,
      eventType: 'runtime.attested',
      payload: {
        status: att.status,
        trustScore: att.trustScore,
        reasons: att.reasons,
      },
    })
    recordUsage(this.supabase, input.orgId, UsageMetrics.RUNTIME_CONNECT, 1, {
      runtimeId: data.id,
      mode: input.mode,
    })
    return attested as RegisteredRuntime
  }

  async reattestRuntime(
    runtimeId: string,
    report?: AttestationReport,
  ): Promise<RegisteredRuntime> {
    const admin = this.admin()
    const { data: row, error: fetchErr } = await admin
      .from('registered_runtimes')
      .select('*')
      .eq('id', runtimeId)
      .maybeSingle()
    if (fetchErr) throw new Error(fetchErr.message)
    if (!row) throw new Error('runtime_not_found')

    const now = new Date().toISOString()
    const att = await evaluateAndTokenize(runtimeId, {
      mode: row.mode as RuntimeMode,
      fingerprint: row.fingerprint as string,
      report,
      challengeStore: this.challenges,
    })

    const { data, error } = await admin
      .from('registered_runtimes')
      .update({
        trust_score: att.trustScore,
        attestation_status: att.status,
        attestation_report: { ...att.report, reasons: att.reasons },
        attestation_token: att.token,
        attested_at: now,
      })
      .eq('id', runtimeId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    await this.insertEvent({
      orgId: row.org_id as string,
      runtimeId,
      eventType: 'runtime.attested',
      payload: { status: att.status, trustScore: att.trustScore, reasons: att.reasons },
    })
    return data as RegisteredRuntime
  }

  async heartbeat(
    runtimeId: string,
    patch: {
      telemetry?: Record<string, unknown>
      currentTask?: string
      activeModel?: string
      status?: 'online' | 'offline' | 'degraded'
    },
  ): Promise<RegisteredRuntime> {
    const now = new Date().toISOString()
    const admin = this.admin()
    const { data, error } = await admin
      .from('registered_runtimes')
      .update({
        last_seen_at: now,
        status: patch.status ?? 'online',
        telemetry: patch.telemetry,
        current_task: patch.currentTask,
        active_model: patch.activeModel,
      })
      .eq('id', runtimeId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RegisteredRuntime
  }

  async updateRuntimePlacement(
    runtimeId: string,
    patch: { deploymentGroupId?: string | null; region?: string | null },
  ): Promise<RegisteredRuntime> {
    const admin = this.admin()
    const row: Record<string, unknown> = {}
    if (patch.deploymentGroupId !== undefined) {
      row.deployment_group_id = patch.deploymentGroupId
    }
    if (patch.region !== undefined) {
      row.region = patch.region?.trim() || null
    }
    const { data, error } = await admin
      .from('registered_runtimes')
      .update(row)
      .eq('id', runtimeId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RegisteredRuntime
  }

  async registerAgent(
    runtimeId: string,
    input: {
      agentId: string
      model?: string
      permissions?: string[]
      metadata?: Record<string, unknown>
    },
  ): Promise<RegisteredAgent> {
    const admin = this.admin()
    const now = new Date().toISOString()
    const { data: runtime } = await admin
      .from('registered_runtimes')
      .select('org_id')
      .eq('id', runtimeId)
      .single()
    if (!runtime) throw new Error('runtime_not_found')

    const { data, error } = await admin
      .from('registered_agents')
      .upsert(
        {
          runtime_id: runtimeId,
          agent_id: input.agentId,
          model: input.model ?? null,
          permissions: input.permissions ?? [],
          metadata: input.metadata ?? {},
          status: 'active',
          last_seen_at: now,
        },
        { onConflict: 'runtime_id,agent_id' },
      )
      .select('*')
      .single()
    if (error) throw new Error(error.message)

    await this.insertEvent({
      orgId: runtime.org_id as string,
      runtimeId,
      agentId: input.agentId,
      eventType: 'agent.registered',
      payload: { model: input.model, permissions: input.permissions },
    })
    recordUsage(this.supabase, runtime.org_id as string, UsageMetrics.AGENT_REGISTER, 1, {
      agentId: input.agentId,
    })
    return data as RegisteredAgent
  }

  async insertEvent(input: {
    orgId: string
    runtimeId?: string
    agentId?: string
    eventType: string
    payload?: Record<string, unknown>
  }): Promise<RuntimeEvent> {
    const admin = this.admin()
    const { data, error } = await admin
      .from('runtime_events')
      .insert({
        org_id: input.orgId,
        runtime_id: input.runtimeId ?? null,
        agent_id: input.agentId ?? null,
        event_type: input.eventType,
        payload: input.payload ?? {},
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RuntimeEvent
  }

  async getRuntimeById(runtimeId: string): Promise<RegisteredRuntime | null> {
    const { data } = await this.admin()
      .from('registered_runtimes')
      .select('*')
      .eq('id', runtimeId)
      .maybeSingle()
    return (data ?? null) as RegisteredRuntime | null
  }

  async listRuntimes(orgId?: string): Promise<RegisteredRuntime[]> {
    const admin = this.admin()
    let q = admin.from('registered_runtimes').select('*').is('deleted_at', null).order('last_seen_at', {
      ascending: false,
      nullsFirst: false,
    })
    if (orgId) q = q.eq('org_id', orgId)
    const { data, error } = await q.limit(SUPABASE_ROW_LIMITS.runtimesList)
    if (error) throw new Error(error.message)
    return (data ?? []) as RegisteredRuntime[]
  }

  async listAgents(runtimeId?: string): Promise<(RegisteredAgent & { runtime_name?: string })[]> {
    const admin = this.admin()
    let q = admin
      .from('registered_agents')
      .select('*, registered_runtimes(name)')
      .is('deleted_at', null)
      .order('last_seen_at', { ascending: false })
    if (runtimeId) q = q.eq('runtime_id', runtimeId)
    const { data, error } = await q.limit(SUPABASE_ROW_LIMITS.agentsList)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: Record<string, unknown>) => {
      const rt = row.registered_runtimes as { name?: string } | null
      const { registered_runtimes: _, ...rest } = row
      return { ...rest, runtime_name: rt?.name } as RegisteredAgent & { runtime_name?: string }
    })
  }

  async deleteRuntime(runtimeId: string): Promise<void> {
    const now = new Date().toISOString()
    const admin = this.admin()
    const { error } = await admin
      .from('registered_runtimes')
      .update({ deleted_at: now, status: 'offline' })
      .eq('id', runtimeId)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    // Cascade soft-delete to all agents on this runtime
    await admin
      .from('registered_agents')
      .update({ deleted_at: now })
      .eq('runtime_id', runtimeId)
      .is('deleted_at', null)
  }

  async deleteAgent(runtimeId: string, agentId: string): Promise<void> {
    const now = new Date().toISOString()
    const admin = this.admin()
    const { error } = await admin
      .from('registered_agents')
      .update({ deleted_at: now })
      .eq('runtime_id', runtimeId)
      .eq('agent_id', agentId)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
  }

  async listEvents(opts: { orgId?: string; limit?: number }): Promise<RuntimeEvent[]> {
    const admin = this.admin()
    let q = admin.from('runtime_events').select('*').order('created_at', { ascending: false })
    if (opts.orgId) q = q.eq('org_id', opts.orgId)
    const eventCap = SUPABASE_ROW_LIMITS.runtimeEventsList
    const { data, error } = await q.limit(Math.min(opts.limit ?? eventCap, eventCap))
    if (error) throw new Error(error.message)
    return (data ?? []) as RuntimeEvent[]
  }

  async markStaleOffline(staleMs = 120_000): Promise<Array<{ id: string; org_id: string; name: string }>> {
    const cutoff = new Date(Date.now() - staleMs).toISOString()
    const admin = this.admin()
    const { data, error } = await admin
      .from('registered_runtimes')
      .update({ status: 'offline' })
      .eq('status', 'online')
      .lt('last_seen_at', cutoff)
      .select('id, org_id, name')
    if (error) throw new Error(error.message)
    return (data ?? []) as Array<{ id: string; org_id: string; name: string }>
  }

  async getUserOrgIds(userId: string): Promise<string[]> {
    const admin = this.admin()
    const result = await queryWithTimeout<{ org_id: string }[]>(
      'organization_members',
      () => admin.from('organization_members').select('org_id').eq('user_id', userId),
    )
    if (result.error) {
      console.warn(`[supabase] getUserOrgIds: ${result.error}`)
      return []
    }
    return result.data.map((r) => r.org_id as string)
  }

  async getApiKeyOrgId(presentedKey: string): Promise<string | null> {
    if (!presentedKey.startsWith('sk_sanctum_')) return null
    const admin = this.admin()
    const prefix = presentedKey.slice(0, 16)
    const { data } = await admin
      .from('api_keys')
      .select('org_id')
      .eq('key_prefix', prefix)
      .is('revoked_at', null)
      .maybeSingle()
    return (data?.org_id as string | null) ?? null
  }

  async getRuntimeOrgId(runtimeId: string): Promise<string | null> {
    const admin = this.admin()
    const { data } = await admin
      .from('registered_runtimes')
      .select('org_id')
      .eq('id', runtimeId)
      .maybeSingle()
    return data?.org_id ?? null
  }
}

