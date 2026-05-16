import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AgentMemoryStore } from './agent-memory-store.js'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { recordUsage, UsageMetrics } from './usage-store.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

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

function assertOrgAllowed(
  scope: string[] | null,
  orgId: string,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (scope === null) return true
  if (!scope.includes(orgId)) {
    reply.status(403).send({ error: 'org_forbidden' })
    return false
  }
  return true
}

const memoryKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_.:@/-]+$/)

const blobSchema = z.object({
  ciphertext: z.string().min(1).max(512_000),
  iv: z.string().min(1).max(64),
  algorithm: z.literal('aes-256-gcm').optional(),
  keyHint: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export async function registerAgentMemoryRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const memory = new AgentMemoryStore(cfg)

  async function resolveRuntime(
    runtimeId: string,
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) {
    const orgId = await store.getRuntimeOrgId(runtimeId)
    if (!orgId) {
      reply.status(404).send({ error: 'runtime_not_found' })
      return null
    }
    return orgId
  }

  app.get('/v1/runtimes/:runtimeId/agents/:agentId/memory', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await resolveRuntime(runtimeId, reply)
    if (!orgId) return
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const keys = await memory.list(runtimeId, agentId)
    return { agentId, runtimeId, keys }
  })

  app.get('/v1/runtimes/:runtimeId/agents/:agentId/memory/:memoryKey', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const memoryKey = memoryKeySchema.parse((req.params as { memoryKey: string }).memoryKey)
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await resolveRuntime(runtimeId, reply)
    if (!orgId) return
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const entry = await memory.get(runtimeId, agentId, memoryKey)
    if (!entry) return reply.status(404).send({ error: 'memory_not_found' })
    return {
      memoryKey: entry.memory_key,
      ciphertext: entry.ciphertext,
      iv: entry.iv,
      algorithm: entry.algorithm,
      keyHint: entry.key_hint,
      metadata: entry.metadata,
      updatedAt: entry.updated_at,
    }
  })

  app.put('/v1/runtimes/:runtimeId/agents/:agentId/memory/:memoryKey', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const memoryKey = memoryKeySchema.parse((req.params as { memoryKey: string }).memoryKey)
    const body = blobSchema.parse(req.body)
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await resolveRuntime(runtimeId, reply)
    if (!orgId) return
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const entry = await memory.upsert(runtimeId, orgId, agentId, memoryKey, body)
    await store.insertEvent({
      orgId,
      runtimeId,
      agentId,
      eventType: 'memory.updated',
      payload: { memoryKey, keyHint: body.keyHint ?? null },
    })
    recordUsage(cfg, orgId, UsageMetrics.MEMORY_WRITE, 1, { memoryKey, agentId })
    return {
      memoryKey: entry.memory_key,
      updatedAt: entry.updated_at,
      keyHint: entry.key_hint,
    }
  })

  app.delete('/v1/runtimes/:runtimeId/agents/:agentId/memory/:memoryKey', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const memoryKey = memoryKeySchema.parse((req.params as { memoryKey: string }).memoryKey)
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await resolveRuntime(runtimeId, reply)
    if (!orgId) return
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const removed = await memory.delete(runtimeId, agentId, memoryKey)
    if (!removed) return reply.status(404).send({ error: 'memory_not_found' })
    await store.insertEvent({
      orgId,
      runtimeId,
      agentId,
      eventType: 'memory.deleted',
      payload: { memoryKey },
    })
    return { ok: true, memoryKey }
  })
}
