import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { UsageStore } from './usage-store.js'
import { resolveOrgScope, type SanctumReq } from './org-scope.js'

export async function registerUsageRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const usage = new UsageStore(cfg)

  app.get('/v1/usage', async (req, reply) => {
    const q = req.query as { org_id?: string; days?: string }
    const orgId = q.org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (scope !== null && !scope.includes(orgId)) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }

    const periodDays = q.days ? Math.min(90, Math.max(1, Number(q.days) || 30)) : 30
    return usage.summary(orgId, periodDays)
  })
}
