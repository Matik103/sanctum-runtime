import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore, defaultFingerprint } from './control-plane-store.js'

const modeSchema = z.enum(['cloud', 'edge', 'airgap', 'hybrid'])

export async function registerControlPlaneRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) {
    app.log.warn('Control plane routes disabled — Supabase not configured')
    return
  }
  const store = new ControlPlaneStore(cfg)

  app.post('/v1/runtimes/connect', async (req) => {
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
      })
      .parse(req.body)

    const runtime = await store.connectRuntime({
      orgId: body.organizationId,
      name: body.runtimeName,
      fingerprint: body.fingerprint ?? defaultFingerprint(),
      mode: body.mode,
      metadata: body.metadata,
      telemetry: body.telemetry,
      activeModel: body.activeModel,
      currentTask: body.currentTask,
    })

    return {
      runtimeId: runtime.id,
      organizationId: runtime.org_id,
      status: runtime.status,
      trustScore: runtime.trust_score,
      connectedAt: runtime.connected_at,
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

    try {
      const runtime = await store.heartbeat(runtimeId, {
        telemetry: body.telemetry,
        currentTask: body.currentTask,
        activeModel: body.activeModel,
        status: body.status,
      })
      return { ok: true, lastSeenAt: runtime.last_seen_at, status: runtime.status }
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

    const orgId = body.organizationId ?? (await store.getRuntimeOrgId(runtimeId))
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })

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
    await store.markStaleOffline()
    return store.listRuntimes(orgId)
  })

  app.get('/v1/runtimes/:runtimeId', async (req, reply) => {
    const { runtimeId } = req.params as { runtimeId: string }
    const runtimes = await store.listRuntimes()
    const runtime = runtimes.find((r) => r.id === runtimeId)
    if (!runtime) return reply.status(404).send({ error: 'runtime_not_found' })
    const agents = await store.listAgents(runtimeId)
    return { runtime, agents }
  })

  app.get('/v1/agents', async (req) => {
    const runtimeId = (req.query as { runtime_id?: string }).runtime_id
    return store.listAgents(runtimeId)
  })

  app.get('/v1/events', async (req) => {
    const q = req.query as { org_id?: string; limit?: string }
    return store.listEvents({
      orgId: q.org_id,
      limit: q.limit ? Number(q.limit) : 100,
    })
  })

  /** Server-sent events for live dashboard (polls every 3s). */
  app.get('/v1/events/stream', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    let lastId = ''
    const tick = async () => {
      try {
        const events = await store.listEvents({ orgId, limit: 20 })
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
