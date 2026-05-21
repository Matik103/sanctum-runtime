import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore, defaultFingerprint } from './control-plane-store.js'
import { OrchestrationStore } from './orchestration-store.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { getEntitlementEngine } from './entitlements.js'
import { sendNotificationDeduped, type NotificationEvent } from './notifications.js'
import { logDataAccess } from './data-access-log.js'
import {
  assertOrgAllowed,
  filterByScope,
  headerKey,
  resolveOrgScope,
  type SanctumReq,
} from './org-scope.js'

function fireNotification(cfg: ReturnType<typeof getSupabaseAuthConfig>, event: NotificationEvent, cooldownMs = 3_600_000): void {
  if (!cfg) return
  const eng = getEntitlementEngine(cfg)
  void eng.getNotificationPrefs(event.orgId).then((prefs) => {
    sendNotificationDeduped(event, {
      email: prefs.email,
      slackWebhookUrl: prefs.slackWebhookUrl,
      notificationWebhookUrl: prefs.notificationWebhookUrl,
    }, cooldownMs)
  }).catch(() => { /* best-effort */ })
}

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

function extractIp(req: FastifyRequest): string | undefined {
  const fwd = req.headers['x-forwarded-for']
  const xff = Array.isArray(fwd) ? fwd[0] : fwd
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (real) return Array.isArray(real) ? real[0] : real
  return (req.ip as string | undefined) || undefined
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

      // Fire notification for failed or low-trust attestations
      if (runtime.attestation_status === 'failed' || (runtime.trust_score ?? 1) < 0.5) {
        const isTampered = (runtime.trust_score ?? 1) < 0.2
        fireNotification(cfg, {
          type: isTampered ? 'runtime.tampered' : 'runtime.attestation_failed',
          orgId,
          title: isTampered
            ? `Runtime tampered: ${runtimeId}`
            : `Attestation failed: ${runtimeId}`,
          body: isTampered
            ? `Runtime "${runtimeId}" has a trust score of ${((runtime.trust_score ?? 0) * 100).toFixed(0)}% — possible tampering detected.`
            : `Runtime "${runtimeId}" attestation failed with status "${runtime.attestation_status}" (trust score: ${((runtime.trust_score ?? 0) * 100).toFixed(0)}%).`,
          severity: isTampered ? 'emergency' : 'critical',
          data: { runtimeId, trustScore: runtime.trust_score, attestationStatus: runtime.attestation_status },
        }, 3_600_000)
      }

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
      const prevRuntime = await store.getRuntimeById(runtimeId)
      const wasOffline = prevRuntime?.status === 'offline'

      const runtime = await store.heartbeat(runtimeId, {
        telemetry: { ...(body.telemetry ?? {}), ...(ip ? { lastIp: ip } : {}) },
        currentTask: body.currentTask,
        activeModel: body.activeModel,
        status: body.status,
      })

      // runtime.reconnected — was offline, now sending heartbeat again
      if (wasOffline && body.status !== 'offline') {
        fireNotification(cfg, {
          type: 'runtime.reconnected',
          orgId,
          title: `Runtime back online: ${prevRuntime?.name ?? runtimeId}`,
          body: `Runtime "${prevRuntime?.name ?? runtimeId}" has reconnected and is sending heartbeats again.`,
          severity: 'info',
          data: { runtimeId, runtimeName: prevRuntime?.name },
        }, 300_000)
      }

      // runtime.high_memory — telemetry reports memory above 90%
      const memPct = typeof body.telemetry?.memoryUsagePct === 'number' ? body.telemetry.memoryUsagePct : null
      if (memPct !== null && memPct >= 90) {
        fireNotification(cfg, {
          type: 'runtime.high_memory',
          orgId,
          title: `High memory on runtime ${prevRuntime?.name ?? runtimeId}`,
          body: `Runtime is using ${memPct}% memory. Consider restarting or scaling.`,
          severity: memPct >= 95 ? 'critical' : 'warning',
          data: { runtimeId, memoryUsagePct: memPct },
        }, 1_800_000)
      }

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

    // Fire notifications for security-relevant runtime events
    const LOOP_EVENTS = ['loop_detected', 'agent.loop_detected', 'infinite_loop', 'runaway_agent']
    if (LOOP_EVENTS.includes(body.eventType)) {
      fireNotification(cfg, {
        type: 'agent.loop_detected',
        orgId,
        title: `Agent loop detected on runtime ${runtimeId}`,
        body: `Agent ${body.agentId ?? 'unknown'} triggered a loop event (${body.eventType}).`,
        severity: 'critical',
        data: { runtimeId, agentId: body.agentId, eventType: body.eventType },
      }, 900_000)
    }

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

    if (orgId) {
      logDataAccess(cfg, req, { orgId, resource: 'runtimes' })
    } else if (scope) {
      for (const oid of scope) logDataAccess(cfg, req, { orgId: oid, resource: 'runtimes' })
    }

    const staleRuntimes = await store.markStaleOffline()
    for (const r of staleRuntimes) {
      fireNotification(cfg, {
        type: 'runtime.offline',
        orgId: r.org_id,
        title: `Runtime offline: ${r.name}`,
        body: `Runtime "${r.name}" (${r.id}) stopped sending heartbeats and has been marked offline.`,
        severity: 'warning',
        data: { runtimeId: r.id, runtimeName: r.name },
      }, 1_800_000) // 30 min cooldown per runtime
    }

    const runtimes = await store.listRuntimes(orgId || undefined)
    return filterByScope(runtimes, scope)
  })

  app.get('/v1/operator/context', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (user) {
      const organizationIds = await store.getUserOrgIds(user.id)
      for (const orgId of organizationIds) {
        logDataAccess(cfg, req, { orgId, resource: 'operator_context' })
      }
      return {
        defaultOrganizationId: organizationIds[0] ?? null,
        organizationIds,
      }
    }
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg) logDataAccess(cfg, req, { orgId: keyOrg, resource: 'operator_context' })
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
    logDataAccess(cfg, req, { orgId: runtime.org_id, resource: 'runtime', resourceId: runtimeId })
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
    const allowedRuntimes = filterByScope(await store.listRuntimes(), scope)
    const allowed = new Set(allowedRuntimes.map((r) => r.id))
    const seenOrgs = new Set(allowedRuntimes.map((r) => r.org_id))
    for (const orgId of seenOrgs) logDataAccess(cfg, req, { orgId, resource: 'agents' })
    return agents.filter((a) => allowed.has(a.runtime_id))
  })

  app.get('/v1/events', async (req) => {
    const q = req.query as { org_id?: string; limit?: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (q.org_id && scope && !scope.includes(q.org_id)) return []
    const orgId = q.org_id || undefined
    if (orgId) {
      logDataAccess(cfg, req, { orgId, resource: 'events' })
    } else if (scope) {
      for (const oid of scope) logDataAccess(cfg, req, { orgId: oid, resource: 'events' })
    }
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

  app.delete('/v1/runtimes/:runtimeId', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, orgId, reply)) return
    await store.deleteRuntime(runtimeId)
    await store.insertEvent({
      orgId,
      runtimeId,
      eventType: 'runtime.deleted',
      payload: { deletedBy: (req as SanctumReq).sanctumUser?.id ?? 'api_key' },
    })
    return reply.status(204).send()
  })

  app.delete('/v1/runtimes/:runtimeId/agents/:agentId', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    if (!assertOrgAllowed(scope, orgId, reply)) return
    await store.deleteAgent(runtimeId, agentId)
    await store.insertEvent({
      orgId,
      runtimeId,
      agentId,
      eventType: 'agent.deleted',
      payload: { deletedBy: (req as SanctumReq).sanctumUser?.id ?? 'api_key' },
    })
    return reply.status(204).send()
  })
}
