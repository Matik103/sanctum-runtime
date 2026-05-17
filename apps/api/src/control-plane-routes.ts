import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore, defaultFingerprint } from './control-plane-store.js'
import { OrchestrationStore } from './orchestration-store.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { getEntitlementEngine } from './entitlements.js'

const modeSchema = z.enum(['cloud', 'edge', 'airgap', 'hybrid'])

const hardwareSchema = z.object({
  type: z.enum(['tpm2', 'software-sealed', 'sgx']),
  challengeId: z.string().uuid(),
  nonce: z.string().min(8).max(128),
  quote: z.string().min(8).max(4096),
  pcrs: z.record(z.string()).optional(),
  version: z.string().max(32).optional(),
})

const attestationSchema = z
  .object({
    platform: z.string().max(64).optional(),
    arch: z.string().max(32).optional(),
    hostname: z.string().max(255).optional(),
    sdkVersion: z.string().max(32).optional(),
    runtimeKind: z.string().max(64).optional(),
    nodeVersion: z.string().max(32).optional(),
    cpuCount: z.number().int().min(1).max(1024).optional(),
    totalMemoryMb: z.number().int().min(0).optional(),
    containerEnv: z.string().max(32).optional(),
    cloudProvider: z.string().max(32).optional(),
    hardware: hardwareSchema.optional(),
  })
  .optional()

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

function extractIp(req: FastifyRequest): string | undefined {
  const fwd = req.headers['x-forwarded-for']
  const xff = Array.isArray(fwd) ? fwd[0] : fwd
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (real) return Array.isArray(real) ? real[0] : real
  return (req.ip as string | undefined) || undefined
}

/** null = unrestricted (legacy env key); [] = no org access */
async function resolveOrgScope(
  req: SanctumReq,
  store: ControlPlaneStore,
): Promise<string[] | null> {
  if (req.sanctumUser) return store.getUserOrgIds(req.sanctumUser.id)
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) {
    const orgId = await store.getApiKeyOrgId(key)
    return orgId ? [orgId] : null
  }
  return null
}

function assertOrgAllowed(scope: string[] | null, orgId: string, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (scope === null) return true
  if (!scope.includes(orgId)) {
    reply.status(403).send({ error: 'org_forbidden' })
    return false
  }
  return true
}

function filterByScope<T extends { org_id: string }>(rows: T[], scope: string[] | null): T[] {
  if (scope === null) return rows
  return rows.filter((r) => scope.includes(r.org_id))
}

export async function registerControlPlaneRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) {
    app.log.warn('Control plane routes disabled — Supabase not configured')
    return
  }
  const store = new ControlPlaneStore(cfg)
  const orch = new OrchestrationStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  app.post('/v1/runtimes/connect', async (req, reply) => {
    const body = z
      .object({
        runtimeName: z.string().min(1).max(120),
        organizationId: z.string().min(1).max(64),
        mode: modeSchema.optional().default('cloud'),
        fingerprint: z.string().min(8).max(128).optional(),
        metadata: z.record(z.unknown()).optional(),
        telemetry: z.record(z.unknown()).optional(),
        activeModel: z.string().optional(),
        currentTask: z.string().optional(),
        attestation: attestationSchema,
        deploymentGroupId: z.string().uuid().optional(),
        region: z.string().max(64).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    let orgId = body.organizationId
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg) orgId = keyOrg
    }
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const slot = await entitlements.checkRuntimeSlot(orgId)
    if (!slot.allowed) {
      return reply.status(402).send({
        error: 'runtime_limit_reached',
        detail: `Your plan allows ${slot.limit} connected runtime${slot.limit === 1 ? '' : 's'}. Upgrade to add more.`,
        used: slot.used,
        limit: slot.limit,
      })
    }

    // SDK minimum version advisory
    const minSdkVersion = process.env.SANCTUM_MIN_SDK_VERSION?.trim()
    let sdkWarning: string | undefined
    const sdkVersion = body.attestation?.sdkVersion
    if (minSdkVersion && sdkVersion) {
      const parseSemver = (v: string) => v.replace(/^v/, '').split('.').map(Number)
      const [minMaj, minMin, minPat] = parseSemver(minSdkVersion)
      const [sdkMaj, sdkMin, sdkPat] = parseSemver(sdkVersion)
      const isOld =
        sdkMaj < minMaj ||
        (sdkMaj === minMaj && sdkMin < minMin) ||
        (sdkMaj === minMaj && sdkMin === minMin && sdkPat < minPat)
      if (isOld) {
        sdkWarning = `SDK ${sdkVersion} is below minimum ${minSdkVersion}. Upgrade @sanctum-runtime/sdk to avoid future connection rejection.`
      }
    }

    const ip = extractIp(req)
    const runtime = await store.connectRuntime({
      orgId,
      name: body.runtimeName,
      fingerprint: body.fingerprint ?? defaultFingerprint(),
      mode: body.mode,
      metadata: { ...body.metadata, ...(ip ? { lastIp: ip } : {}) },
      telemetry: body.telemetry,
      activeModel: body.activeModel,
      currentTask: body.currentTask,
      attestationReport: body.attestation,
      deploymentGroupId: body.deploymentGroupId,
      region: body.region,
    })

    return {
      runtimeId: runtime.id,
      organizationId: runtime.org_id,
      status: runtime.status,
      trustScore: runtime.trust_score,
      attestationStatus: runtime.attestation_status,
      attestationToken: runtime.attestation_token,
      hardwareVerified: Boolean(
        (runtime.attestation_report as Record<string, unknown>)?.hardwareVerified,
      ),
      connectedAt: runtime.connected_at,
      ...(sdkWarning ? { sdkWarning } : {}),
    }
  })

  app.post('/v1/runtimes/:runtimeId/attest', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const body = z.object({ attestation: attestationSchema }).parse(req.body ?? {})
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, orgId, reply)) return

    try {
      const runtime = await store.reattestRuntime(runtimeId, body.attestation)
      return {
        runtimeId: runtime.id,
        trustScore: runtime.trust_score,
        attestationStatus: runtime.attestation_status,
        attestationToken: runtime.attestation_token,
        attestedAt: runtime.attested_at,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'attest_failed'
      if (msg === 'runtime_not_found') return reply.status(404).send({ error: msg })
      throw e
    }
  })

  app.post('/v1/runtimes/:runtimeId/heartbeat', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const body = z
      .object({
        telemetry: z.record(z.unknown()).optional(),
        currentTask: z.string().optional(),
        activeModel: z.string().optional(),
        status: z.enum(['online', 'offline', 'degraded']).optional(),
      })
      .parse(req.body ?? {})

    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, orgId, reply)) return

    try {
      const ip = extractIp(req)
      const runtime = await store.heartbeat(runtimeId, {
        telemetry: { ...(body.telemetry ?? {}), ...(ip ? { lastIp: ip } : {}) },
        currentTask: body.currentTask,
        activeModel: body.activeModel,
        status: body.status,
      })
      const commands =
        body.status === 'offline' || runtimeWsHub.isConnected(runtimeId)
          ? []
          : await orch.claimPendingCommands(runtimeId).then((list) =>
              list.map((c) => ({
                id: c.id,
                command: c.command,
                payload: c.payload,
              })),
            )
      // Record ~1 minute of runtime uptime per heartbeat (approx 60s interval)
      recordUsage(cfg, orgId, UsageMetrics.RUNTIME_HOURS, 1 / 60)
      return {
        ok: true,
        lastSeenAt: runtime.last_seen_at,
        status: runtime.status,
        wsConnected: runtimeWsHub.isConnected(runtimeId),
        commands,
      }
    } catch {
      return reply.status(404).send({ error: 'runtime_not_found' })
    }
  })

  app.post('/v1/runtimes/:runtimeId/agents', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const body = z
      .object({
        id: z.string().min(1).max(120),
        model: z.string().optional(),
        permissions: z.array(z.string()).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    const runtimeOrgId = await store.getRuntimeOrgId(runtimeId)
    if (!runtimeOrgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, runtimeOrgId, reply)) return

    try {
      const agent = await store.registerAgent(runtimeId, {
        agentId: body.id,
        model: body.model,
        permissions: body.permissions,
        metadata: body.metadata,
      })
      return { agentId: agent.agent_id, registered: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'register_failed'
      if (msg === 'runtime_not_found') return reply.status(404).send({ error: msg })
      throw e
    }
  })

  app.post('/v1/runtimes/:runtimeId/events', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const body = z
      .object({
        eventType: z.string().min(1).max(120),
        agentId: z.string().optional(),
        payload: z.record(z.unknown()).optional(),
        organizationId: z.string().optional(),
      })
      .parse(req.body)

    // Always derive org from the runtime record; ignore body.organizationId to prevent spoofing.
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const event = await store.insertEvent({
      orgId,
      runtimeId,
      agentId: body.agentId,
      eventType: body.eventType,
      payload: body.payload,
    })
    return { eventId: event.id, createdAt: event.created_at }
  })

  app.get('/v1/runtimes', async (req) => {
    const orgId = (req.query as { org_id?: string }).org_id
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (orgId && scope && !scope.includes(orgId)) return []
    await store.markStaleOffline()
    const runtimes = await store.listRuntimes(orgId || undefined)
    return filterByScope(runtimes, scope)
  })

  app.get('/v1/operator/context', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (user) {
      const organizationIds = await store.getUserOrgIds(user.id)
      return {
        defaultOrganizationId: organizationIds[0] ?? null,
        organizationIds,
      }
    }
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      return {
        defaultOrganizationId: keyOrg,
        organizationIds: keyOrg ? [keyOrg] : [],
      }
    }
    return reply.status(401).send({ error: 'unauthorized' })
  })

  app.get('/v1/runtimes/:runtimeId', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const runtimes = filterByScope(await store.listRuntimes(), scope)
    const runtime = runtimes.find((r) => r.id === runtimeId)
    if (!runtime) return reply.status(404).send({ error: 'runtime_not_found' })
    const agents = await store.listAgents(runtimeId)
    return { runtime, agents }
  })

  app.patch('/v1/runtimes/:runtimeId/placement', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const body = z
      .object({
        deploymentGroupId: z.string().uuid().nullable().optional(),
        region: z.string().max(64).nullable().optional(),
      })
      .parse(req.body ?? {})

    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const runtime = await store.updateRuntimePlacement(runtimeId, {
      deploymentGroupId: body.deploymentGroupId,
      region: body.region,
    })
    return {
      runtimeId: runtime.id,
      deploymentGroupId: runtime.deployment_group_id,
      region: runtime.region,
    }
  })

  app.get('/v1/runtimes/:runtimeId/trust', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const runtimes = filterByScope(await store.listRuntimes(), scope)
    const runtime = runtimes.find((r) => r.id === runtimeId)
    if (!runtime) return reply.status(404).send({ error: 'runtime_not_found' })
    return {
      runtimeId: runtime.id,
      trustScore: runtime.trust_score,
      attestationStatus: runtime.attestation_status,
      attestationReport: runtime.attestation_report,
      attestedAt: runtime.attested_at,
      verified: runtime.attestation_status === 'verified',
    }
  })

  app.get('/v1/agents', async (req) => {
    const runtimeId = (req.query as { runtime_id?: string }).runtime_id
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const agents = await store.listAgents(runtimeId)
    if (scope === null) return agents
    const allowed = new Set(
      filterByScope(await store.listRuntimes(), scope).map((r) => r.id),
    )
    return agents.filter((a) => allowed.has(a.runtime_id))
  })

  app.get('/v1/events', async (req) => {
    const q = req.query as { org_id?: string; limit?: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (q.org_id && scope && !scope.includes(q.org_id)) return []
    const orgId = q.org_id || undefined
    const events = await store.listEvents({
      orgId,
      limit: q.limit ? Number(q.limit) : 100,
    })
    return filterByScope(events, scope)
  })

  /** Server-sent events for live dashboard (polls every 3s). */
  app.get('/v1/events/stream', async (req, reply) => {
    const q = req.query as { org_id?: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (q.org_id && scope && !scope.includes(q.org_id)) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }
    const orgId = q.org_id || undefined
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let lastId = ''
    const tick = async () => {
      try {
        let events = await store.listEvents({ orgId, limit: 20 })
        events = filterByScope(events, scope)
        const payload = JSON.stringify(events)
        if (payload !== lastId) {
          lastId = payload
          reply.raw.write(`data: ${payload}\n\n`)
        }
      } catch {
        /* ignore tick errors */
      }
    }

    await tick()
    const interval = setInterval(tick, 3000)
    req.raw.on('close', () => clearInterval(interval))
  })
}
