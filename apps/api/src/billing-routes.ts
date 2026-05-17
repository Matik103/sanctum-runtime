import { createHmac, timingSafeEqual } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig, createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine, PLAN_DEFAULTS, type PlanId } from './entitlements.js'
import { getUsageStore } from './usage-store.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

async function resolveOrgId(req: SanctumReq, store: ControlPlaneStore, qOrgId?: string): Promise<string | null> {
  if (qOrgId) {
    const scope = req.sanctumUser ? await store.getUserOrgIds(req.sanctumUser.id) : null
    const key = headerKey(req)
    if (!req.sanctumUser && key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg !== qOrgId) return null
      return qOrgId
    }
    if (scope !== null && !scope.includes(qOrgId)) return null
    return qOrgId
  }
  if (req.sanctumUser) {
    const orgs = await store.getUserOrgIds(req.sanctumUser.id)
    return orgs?.[0] ?? null
  }
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) return store.getApiKeyOrgId(key)
  return null
}

export async function registerBillingRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)
  const usage = getUsageStore(cfg)

  // GET /v1/billing/plan?org_id=
  app.get('/v1/billing/plan', async (req, reply) => {
    const q = req.query as { org_id?: string }
    const orgId = await resolveOrgId(req as SanctumReq, store, q.org_id)
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })

    const [limits, usageSummary] = await Promise.all([
      entitlements.getLimits(orgId),
      usage.summary(orgId, 30),
    ])

    const totals = usageSummary.totals
    const eventsThisMonth = Object.entries(totals)
      .filter(([k]) => k !== 'runtime.hours')
      .reduce((sum, [, v]) => sum + v, 0)
    const runtimeHoursThisMonth = Math.round((totals['runtime.hours'] ?? 0) * 10) / 10

    // Fetch active runtime count
    const runtimesConnected = await entitlements.getActiveRuntimeCount(orgId)

    // Active agents on this org's runtimes (registered_agents via runtime_id)
    let agentsActive = 0
    try {
      const admin = createSupabaseAdmin(cfg)
      const { data: runtimeRows } = await admin
        .from('registered_runtimes')
        .select('id')
        .eq('org_id', orgId)
      const runtimeIds = (runtimeRows ?? []).map((r) => r.id as string)
      if (runtimeIds.length > 0) {
        const { count } = await admin
          .from('registered_agents')
          .select('id', { count: 'exact', head: true })
          .in('runtime_id', runtimeIds)
          .eq('status', 'active')
        agentsActive = count ?? 0
      }
    } catch { /* ignore */ }

    // Paddle subscription info
    let paddleCustomerId: string | null = null
    let billingCycleAnchor: string | null = null
    let paddleSubscriptionId: string | null = null
    try {
      const admin = createSupabaseAdmin(cfg)
      const { data } = await admin
        .from('org_plans')
        .select('paddle_customer_id, paddle_subscription_id, billing_cycle_anchor')
        .eq('org_id', orgId)
        .maybeSingle()
      paddleCustomerId = data?.paddle_customer_id ?? null
      paddleSubscriptionId = data?.paddle_subscription_id ?? null
      billingCycleAnchor = data?.billing_cycle_anchor ?? null
    } catch { /* ignore */ }

    const eventsLimit = limits.maxEventsPerMonth
    const runtimesLimit = limits.maxRuntimes

    return {
      plan: {
        id: limits.planId,
        name: limits.planName,
        priceMonthlyUsd: limits.priceMonthlyUsd,
      },
      limits: {
        maxRuntimes: limits.maxRuntimes,
        maxEventsPerMonth: limits.maxEventsPerMonth,
        maxAgents: limits.maxAgents,
        retentionDays: limits.retentionDays,
        features: limits.features,
      },
      usage: {
        eventsThisMonth,
        runtimesConnected,
        agentsActive,
        runtimeHoursThisMonth,
      },
      quotas: {
        events: {
          used: eventsThisMonth,
          limit: eventsLimit,
          pct: eventsLimit ? Math.round((eventsThisMonth / eventsLimit) * 100) : null,
        },
        runtimes: {
          used: runtimesConnected,
          limit: runtimesLimit,
          pct: runtimesLimit ? Math.round((runtimesConnected / runtimesLimit) * 100) : null,
        },
      },
      billing: {
        paddleCustomerId,
        paddleSubscriptionId,
        billingCycleAnchor,
      },
    }
  })

  // POST /v1/billing/checkout — Paddle checkout URL stub
  app.post('/v1/billing/checkout', async (req, reply) => {
    const body = z.object({
      org_id: z.string().min(1),
      plan_id: z.enum(['operator', 'team', 'enterprise']),
      success_url: z.string().url().optional(),
      cancel_url: z.string().url().optional(),
    }).parse(req.body)

    const orgId = await resolveOrgId(req as SanctumReq, store, body.org_id)
    if (!orgId) return reply.status(403).send({ error: 'org_forbidden' })

    const paddleProductIds: Record<string, string> = {
      operator: process.env.PADDLE_PRODUCT_OPERATOR ?? '',
      team: process.env.PADDLE_PRODUCT_TEAM ?? '',
      enterprise: process.env.PADDLE_PRODUCT_ENTERPRISE ?? '',
    }

    const productId = paddleProductIds[body.plan_id]
    if (!productId) {
      // Return contact-sales stub for enterprise or missing Paddle config
      if (body.plan_id === 'enterprise' || !process.env.PADDLE_VENDOR_ID) {
        return {
          checkoutUrl: null,
          contactEmail: 'billing@sanctum.run',
          message: 'Contact us for Enterprise pricing',
        }
      }
    }

    // Paddle Billing overlay URL (v2 Classic or Billing)
    const vendorId = process.env.PADDLE_VENDOR_ID ?? ''
    const baseUrl = process.env.PADDLE_SANDBOX === 'true'
      ? 'https://sandbox-checkout.paddle.com'
      : 'https://checkout.paddle.com'

    const checkoutUrl = vendorId && productId
      ? `${baseUrl}/checkout/product/${productId}?passthrough=${encodeURIComponent(JSON.stringify({ org_id: orgId }))}`
      : null

    return {
      checkoutUrl,
      planId: body.plan_id,
      planName: PLAN_DEFAULTS[body.plan_id as PlanId].planName,
      priceMonthlyUsd: PLAN_DEFAULTS[body.plan_id as PlanId].priceMonthlyUsd,
      message: checkoutUrl ? null : 'Paddle not configured — contact billing@sanctum.run',
    }
  })

  // POST /v1/billing/webhook — Paddle inbound webhook (no auth, signature-verified)
  app.post('/v1/billing/webhook', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const secret = process.env.PADDLE_WEBHOOK_SECRET
    if (!secret) {
      app.log.warn('[billing/webhook] PADDLE_WEBHOOK_SECRET not set — skipping signature check')
    } else {
      // Paddle Billing signature: "ts=<epoch>;h1=<hmac>"
      const sigHeader = req.headers['paddle-signature'] as string | undefined
      if (!sigHeader) return reply.status(401).send({ error: 'missing_signature' })

      const parts = Object.fromEntries(sigHeader.split(';').map((p) => p.split('=')))
      const ts = parts['ts']
      const h1 = parts['h1']
      if (!ts || !h1) return reply.status(401).send({ error: 'malformed_signature' })

      // Reject stale webhooks (>5 min)
      if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
        return reply.status(401).send({ error: 'stale_webhook' })
      }

      const rawBody = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body))
      const expected = createHmac('sha256', secret)
        .update(`${ts}:${rawBody.toString('utf8')}`)
        .digest('hex')

      try {
        if (!timingSafeEqual(Buffer.from(h1, 'hex'), Buffer.from(expected, 'hex'))) {
          return reply.status(401).send({ error: 'invalid_signature' })
        }
      } catch {
        return reply.status(401).send({ error: 'invalid_signature' })
      }
    }

    const event = req.body as Record<string, unknown>
    const eventType = event['event_type'] as string | undefined
    app.log.info({ eventType }, '[billing/webhook] received')

    // Extract org_id from Paddle passthrough / custom_data
    const customData = (event['data'] as Record<string, unknown>)?.['custom_data'] as Record<string, unknown> | undefined
    const passthrough = customData?.['org_id'] as string | undefined

    if (!passthrough) {
      return reply.status(200).send({ ok: true, note: 'no org_id in custom_data — skipped' })
    }

    const admin = createSupabaseAdmin(cfg)

    const PLAN_MAP: Record<string, PlanId> = {
      'subscription.activated': 'operator',  // default; overridden by product mapping below
      'subscription.updated': 'operator',
      'subscription.cancelled': 'free',
      'subscription.paused': 'free',
    }

    // Map Paddle price/product IDs to plan IDs
    const priceId = (event['data'] as Record<string, unknown>)?.['items'] as unknown
    let planId: PlanId | null = null

    const productIdMap: Record<string, PlanId> = {
      [process.env.PADDLE_PRODUCT_OPERATOR ?? '__none__']: 'operator',
      [process.env.PADDLE_PRODUCT_TEAM ?? '__none__']: 'team',
      [process.env.PADDLE_PRODUCT_ENTERPRISE ?? '__none__']: 'enterprise',
    }

    if (Array.isArray(priceId)) {
      for (const item of priceId as Record<string, unknown>[]) {
        const pid = item['price']?.['product_id'] as string | undefined
        if (pid && productIdMap[pid]) {
          planId = productIdMap[pid]
          break
        }
      }
    }
    if (!planId && eventType && PLAN_MAP[eventType]) planId = PLAN_MAP[eventType]

    if (planId) {
      const subscriptionId = (event['data'] as Record<string, unknown>)?.['id'] as string | undefined
      const customerId = (event['data'] as Record<string, unknown>)?.['customer_id'] as string | undefined

      const { error } = await admin
        .from('org_plans')
        .upsert({
          org_id: passthrough,
          plan_id: planId,
          paddle_subscription_id: subscriptionId ?? null,
          paddle_customer_id: customerId ?? null,
          billing_cycle_anchor: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })

      if (error) {
        app.log.error({ err: error }, '[billing/webhook] upsert failed')
        return reply.status(500).send({ error: 'db_error' })
      }

      app.log.info({ orgId: passthrough, planId }, '[billing/webhook] plan updated')
    }

    return reply.status(200).send({ ok: true })
  })
}
