import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { AlertStore } from './alert-store.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { isProduction } from './security.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

async function resolveOrgScope(req: SanctumReq, store: ControlPlaneStore): Promise<string[] | null> {
  if (req.sanctumUser) return store.getUserOrgIds(req.sanctumUser.id)
  if (req.sanctumApiKeyScope !== undefined) return req.sanctumApiKeyScope
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) {
    const orgId = await store.getApiKeyOrgId(key)
    return orgId ? [orgId] : []
  }

  if (!isProduction()) return null

  const bound = process.env.SANCTUM_LEGACY_KEY_ORG_ID?.trim()
  return bound ? [bound] : []
}

function assertOrgAllowed(
  scope: string[] | null,
  orgId: string,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
): boolean {
  if (scope === null) return true
  if (!scope.includes(orgId)) {
    reply.status(403).send({ error: 'org_forbidden' })
    return false
  }
  return true
}

async function resolveDefaultOrgId(
  req: SanctumReq,
  store: ControlPlaneStore,
  qOrgId?: string,
): Promise<string | null> {
  const scope = await resolveOrgScope(req, store)
  if (qOrgId) return assertScopeContains(scope, qOrgId) ? qOrgId : null
  if (scope === null) return null
  return scope[0] ?? null
}

function assertScopeContains(scope: string[] | null, orgId: string): boolean {
  return scope === null || scope.includes(orgId)
}

const severityEnum = z.enum(['info', 'warning', 'critical', 'emergency'])
const channelEnum = z.enum(['email', 'slack', 'webhook', 'dashboard', 'push'])

export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const alerts = new AlertStore(cfg)
  const cp = new ControlPlaneStore(cfg)

  // ── Alerts ──────────────────────────────────────────────────────────────────

  app.get('/v1/alerts', async (req, reply) => {
    const q = req.query as {
      org_id?: string
      status?: string
      severity?: string
      limit?: string
      offset?: string
    }
    const orgId = await resolveDefaultOrgId(req as SanctumReq, cp, q.org_id)
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })

    return {
      alerts: await alerts.listAlerts(orgId, {
        status: (q.status as 'open' | 'acknowledged' | 'resolved' | 'all') ?? 'all',
        severity: q.severity as 'info' | 'warning' | 'critical' | 'emergency' | undefined,
        limit: q.limit ? Math.min(Number(q.limit), 500) : 100,
        offset: q.offset ? Number(q.offset) : 0,
      }),
    }
  })

  app.get('/v1/orgs/:orgId/alerts', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const q = req.query as { status?: string; severity?: string; limit?: string; offset?: string }
    return {
      alerts: await alerts.listAlerts(orgId, {
        status: (q.status as 'open' | 'acknowledged' | 'resolved' | 'all') ?? 'all',
        severity: q.severity as 'info' | 'warning' | 'critical' | 'emergency' | undefined,
        limit: q.limit ? Math.min(Number(q.limit), 500) : 100,
        offset: q.offset ? Number(q.offset) : 0,
      }),
    }
  })

  app.get('/v1/orgs/:orgId/alerts/stats', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return
    return alerts.stats(orgId)
  })

  app.post('/v1/orgs/:orgId/alerts/:alertId/acknowledge', async (req, reply) => {
    const { orgId, alertId } = req.params as { orgId: string; alertId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const by = (req as SanctumReq).sanctumUser?.email ?? 'api'
    try {
      const alert = await alerts.acknowledgeAlert(alertId, orgId, by)
      if (!alert) return reply.status(404).send({ error: 'alert_not_found' })
      return { alert }
    } catch (e) {
      return reply.status(500).send({ error: 'acknowledge_failed' })
    }
  })

  app.post('/v1/orgs/:orgId/alerts/:alertId/resolve', async (req, reply) => {
    const { orgId, alertId } = req.params as { orgId: string; alertId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const by = (req as SanctumReq).sanctumUser?.email ?? 'api'
    try {
      const alert = await alerts.resolveAlert(alertId, orgId, by)
      if (!alert) return reply.status(404).send({ error: 'alert_not_found' })
      return { alert }
    } catch (e) {
      return reply.status(500).send({ error: 'resolve_failed' })
    }
  })

  // ── Alert rules ─────────────────────────────────────────────────────────────

  app.get('/v1/orgs/:orgId/alert-rules', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return
    return { rules: await alerts.listRules(orgId) }
  })

  app.post('/v1/orgs/:orgId/alert-rules', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const body = z
      .object({
        name: z.string().min(1).max(120),
        event_type: z.string().min(1).max(64),
        threshold: z.number().int().min(1).max(1000).default(1),
        window_minutes: z.number().int().min(1).max(10080).default(60),
        severity: severityEnum,
        channels: z.array(channelEnum).default(['email']),
      })
      .parse(req.body)

    try {
      const rule = await alerts.createRule({ org_id: orgId, ...body })
      return reply.status(201).send({ rule })
    } catch (e) {
      return reply.status(500).send({ error: 'create_rule_failed' })
    }
  })

  app.patch('/v1/orgs/:orgId/alert-rules/:ruleId', async (req, reply) => {
    const { orgId, ruleId } = req.params as { orgId: string; ruleId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        threshold: z.number().int().min(1).max(1000).optional(),
        window_minutes: z.number().int().min(1).max(10080).optional(),
        severity: severityEnum.optional(),
        channels: z.array(channelEnum).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body)

    try {
      const rule = await alerts.updateRule(ruleId, orgId, body)
      if (!rule) return reply.status(404).send({ error: 'rule_not_found' })
      return { rule }
    } catch (e) {
      return reply.status(500).send({ error: 'update_rule_failed' })
    }
  })

  app.delete('/v1/orgs/:orgId/alert-rules/:ruleId', async (req, reply) => {
    const { orgId, ruleId } = req.params as { orgId: string; ruleId: string }
    const scope = await resolveOrgScope(req as SanctumReq, cp)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    try {
      await alerts.deleteRule(ruleId, orgId)
      return { ok: true }
    } catch (e) {
      return reply.status(500).send({ error: 'delete_rule_failed' })
    }
  })
}
