import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { OrchestrationStore } from './orchestration-store.js'

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

export async function registerOrchestrationRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const orch = new OrchestrationStore(cfg)

  app.get('/v1/deployment-groups', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return
    return orch.listDeploymentGroups(orgId)
  })

  app.post('/v1/deployment-groups', async (req, reply) => {
    const body = z
      .object({
        organizationId: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        region: z.string().max(64).optional(),
        description: z.string().max(500).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return

    await store.ensureOrg(body.organizationId)
    const group = await orch.createDeploymentGroup({
      orgId: body.organizationId,
      name: body.name,
      region: body.region,
      description: body.description,
      metadata: body.metadata,
    })
    return { group }
  })

  app.get('/v1/fleet/map', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    await store.markStaleOffline()
    const runtimes = (await store.listRuntimes(orgId)).filter(
      (r) => scope === null || scope.includes(r.org_id),
    )
    const groups = await orch.listDeploymentGroups(orgId)
    const agents = await store.listAgents()
    const agentCount = agents.filter((a) =>
      runtimes.some((r) => r.id === a.runtime_id),
    ).length

    return orch.buildFleetMap(runtimes, groups, agentCount)
  })

  app.post('/v1/orchestration/dispatch', async (req, reply) => {
    const body = z
      .object({
        organizationId: z.string().min(1).max(64),
        command: z.string().min(1).max(120),
        payload: z.record(z.unknown()).optional(),
        runtimeId: z.string().uuid().optional(),
        deploymentGroupId: z.string().uuid().optional(),
        region: z.string().max(64).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return

    try {
      const result = await orch.dispatchCommand({
        orgId: body.organizationId,
        command: body.command,
        payload: body.payload,
        runtimeId: body.runtimeId,
        deploymentGroupId: body.deploymentGroupId,
        region: body.region,
      })
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'dispatch_failed'
      if (msg === 'dispatch_target_required') {
        return reply.status(400).send({ error: msg })
      }
      throw e
    }
  })

  app.post('/v1/commands/:commandId/ack', async (req, reply) => {
    const { commandId } = req.params as { commandId: string }
    const body = z
      .object({
        runtimeId: z.string().uuid(),
        ok: z.boolean().optional().default(true),
      })
      .parse(req.body)

    const orgId = await store.getRuntimeOrgId(body.runtimeId)
    if (!orgId) return reply.status(404).send({ error: 'runtime_not_found' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    await orch.ackCommand(commandId, body.runtimeId, body.ok)
    return { ok: true }
  })
}
