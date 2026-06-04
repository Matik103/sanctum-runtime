import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AgentMemoryStore } from './agent-memory-store.js'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { assertOrgAllowed, resolveOrgScope, type SanctumReq } from './org-scope.js'
import { getEntitlementEngine } from './entitlements.js'
import { canUseAgentMemory, sendPlanFeatureRequired } from './entitlements-gate.js'

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
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function registerAgentMemoryRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const memory = new AgentMemoryStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

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

  async function requireAgentMemory(orgId: string, reply: import('fastify').FastifyReply): Promise<boolean> {
    const limits = await entitlements.getLimits(orgId)
    if (canUseAgentMemory(limits)) return true
    sendPlanFeatureRequired(reply, limits, 'cloud_sync', 'Hosted encrypted agent memory requires Operator or higher.')
    return false
  }

  app.get('/v1/runtimes/:runtimeId/agents/:agentId/memory', async (req, reply) => {
    const { runtimeId, agentId } = req.params as { runtimeId: string; agentId: string }
    const scope = await resolveOrgScope(req as SanctumReq, store)
    const orgId = await resolveRuntime(runtimeId, reply)
    if (!orgId) return
    if (!assertOrgAllowed(scope, orgId, reply)) return
    if (!(await requireAgentMemory(orgId, reply))) return

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
    if (!(await requireAgentMemory(orgId, reply))) return

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
    if (!(await requireAgentMemory(orgId, reply))) return

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
    if (!(await requireAgentMemory(orgId, reply))) return

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
