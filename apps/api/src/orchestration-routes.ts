import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { OrchestrationStore } from './orchestration-store.js'
import { assertOrgAllowed, resolveOrgScope, type SanctumReq } from './org-scope.js'
import { getEntitlementEngine } from './entitlements.js'
import { canUseOrchestration, sendPlanFeatureRequired } from './entitlements-gate.js'

export async function registerOrchestrationRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const orch = new OrchestrationStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  app.get('/v1/deployment-groups', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const limits = await entitlements.getLimits(orgId)
    if (!canUseOrchestration(limits)) {
      sendPlanFeatureRequired(reply, limits, 'advanced_fleet', 'Deployment groups require the Team plan.')
      return
    }

    return orch.listDeploymentGroups(orgId)
  })

  app.post('/v1/deployment-groups', async (req, reply) => {
    const body = z
      .object({
        organizationId: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        region: z.string().max(64).optional(),
        description: z.string().max(500).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return

    const limits = await entitlements.getLimits(body.organizationId)
    if (!canUseOrchestration(limits)) {
      sendPlanFeatureRequired(reply, limits, 'advanced_fleet', 'Deployment groups require the Team plan.')
      return
    }

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

    const limits = await entitlements.getLimits(orgId)
    if (!canUseOrchestration(limits)) {
      sendPlanFeatureRequired(reply, limits, 'advanced_fleet', 'Fleet maps require the Team plan.')
      return
    }

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
        payload: z.record(z.string(), z.unknown()).optional(),
        runtimeId: z.string().uuid().optional(),
        deploymentGroupId: z.string().uuid().optional(),
        region: z.string().max(64).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return

    const limits = await entitlements.getLimits(body.organizationId)
    if (!canUseOrchestration(limits)) {
      sendPlanFeatureRequired(reply, limits, 'advanced_fleet', 'Fleet dispatch requires the Team plan.')
      return
    }

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
