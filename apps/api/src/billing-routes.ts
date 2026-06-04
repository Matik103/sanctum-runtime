import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig, createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine, PLAN_DEFAULTS, type PlanId } from './entitlements.js'
import { getUsageStore } from './usage-store.js'
import { sendNotificationDeduped } from './notifications.js'
import {
  verifyCreemSignature,
  resolveCreemPlanUpdate,
  type CreemWebhookEvent,
} from './creem-billing.js'
import {
  creemCreateCheckoutSession,
  creemProductIdForPlan,
  creemPublicConfig,
  defaultBillingReturnUrls,
  getCreemConfig,
  type PaidPlanId,
} from './creem-client.js'
import { resolveDashboardUrl } from '../../../scripts/env.ts'

const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000
const PROCESSED_EVENT_MAX = 5000
const processedEvents = new Map<string, number>()

function wasRecentlyProcessed(eventId: string | undefined): boolean {
  if (!eventId) return false
  const seenAt = processedEvents.get(eventId)
  return seenAt != null && Date.now() - seenAt < PROCESSED_EVENT_TTL_MS
}

function markEventProcessed(eventId: string | undefined): void {
  if (!eventId) return
  if (processedEvents.size >= PROCESSED_EVENT_MAX) {
    const oldest = processedEvents.keys().next().value
    if (oldest !== undefined) processedEvents.delete(oldest)
  }
  processedEvents.set(eventId, Date.now())
}

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
  rawBody?: Buffer
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

async function resolveOrgId(req: SanctumReq, store: ControlPlaneStore, qOrgId?: string): Promise<string | null> {
  if (qOrgId) {
    const scope = req.sanctumUser ? await store.getUserOrgIds(req.sanctumUser.id) : null
    if (req.sanctumApiKeyScope !== undefined) {
      return req.sanctumApiKeyScope.includes(qOrgId) ? qOrgId : null
    }
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
  if (req.sanctumApiKeyScope !== undefined) return req.sanctumApiKeyScope[0] ?? null
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) return store.getApiKeyOrgId(key)
  return null
}

function staticCreemCheckoutUrl(planId: PaidPlanId, orgId: string, urls: { success?: string; cancel?: string }): string | null {
  const envMap: Record<PaidPlanId, string | undefined> = {
    personal: process.env.CREEM_CHECKOUT_PERSONAL_URL,
    operator: process.env.CREEM_CHECKOUT_OPERATOR_URL,
    team: process.env.CREEM_CHECKOUT_TEAM_URL,
  }
  const base = envMap[planId]?.trim()
  if (!base) return null
  const checkout = new URL(base)
  checkout.searchParams.set('org_id', orgId)
  checkout.searchParams.set('plan', planId)
  checkout.searchParams.set('request_id', orgId)
  if (urls.success) checkout.searchParams.set('success_url', urls.success)
  if (urls.cancel) checkout.searchParams.set('cancel_url', urls.cancel)
  return checkout.toString()
}

async function handleCreemWebhook(
  app: FastifyInstance,
  cfg: NonNullable<ReturnType<typeof getSupabaseAuthConfig>>,
  entitlements: ReturnType<typeof getEntitlementEngine>,
  req: FastifyRequest,
  reply: import('fastify').FastifyReply,
) {
  const secret = process.env.CREEM_WEBHOOK_SECRET?.trim()
  if (!secret) {
    const { isProduction } = await import('./security.js')
    if (isProduction()) {
      app.log.error('[billing/webhook] CREEM_WEBHOOK_SECRET not set — rejecting webhook')
      return reply.status(503).send({ error: 'webhook_not_configured' })
    }
    app.log.warn('[billing/webhook] CREEM_WEBHOOK_SECRET not set — skipping signature check (dev only)')
  } else {
    const sigHeader = req.headers['creem-signature'] as string | undefined
    const rawBody = (req as SanctumReq).rawBody
    if (!rawBody) {
      app.log.error('[billing/webhook] raw body missing — check content-type parser')
      return reply.status(400).send({ error: 'raw_body_required' })
    }
    if (!verifyCreemSignature(rawBody, sigHeader, secret)) {
      return reply.status(401).send({ error: 'invalid_signature' })
    }
  }

  const event = req.body as CreemWebhookEvent
  const eventId = event.id
  const eventType = event.eventType

  if (wasRecentlyProcessed(eventId)) {
    app.log.info({ eventId, eventType }, '[billing/webhook] duplicate Creem event ignored')
    return reply.status(200).send({ ok: true, duplicate: true })
  }
  app.log.info({ eventId, eventType }, '[billing/webhook] Creem event received')

  const update = resolveCreemPlanUpdate(event)
  if (!update.orgId) {
    markEventProcessed(eventId)
    return reply.status(200).send({ ok: true, note: 'no org_id in Creem metadata — skipped' })
  }

  const admin = createSupabaseAdmin(cfg)

  if (update.shouldUpsertPlan && update.planId) {
    const { error } = await admin
      .from('org_plans')
      .upsert({
        org_id: update.orgId,
        plan_id: update.planId,
        creem_subscription_id: update.subscriptionId ?? null,
        creem_customer_id: update.customerId ?? null,
        billing_cycle_anchor: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' })

    if (error) {
      app.log.error({ err: error }, '[billing/webhook] upsert failed')
      return reply.status(500).send({ error: 'db_error' })
    }

    app.log.info({ orgId: update.orgId, planId: update.planId, revoke: update.revoke }, '[billing/webhook] plan updated')

    void entitlements.getNotificationPrefs(update.orgId).then((prefs) => {
      sendNotificationDeduped(
        {
          type: 'billing.plan_changed',
          orgId: update.orgId!,
          title: `Plan updated: ${update.planId}`,
          body: update.revoke
            ? 'Your Sanctum subscription ended. You are on the Observer plan (observe-only).'
            : `Your Sanctum plan is now "${update.planId}". Changes take effect immediately.`,
          severity: 'info',
          data: { planId: update.planId, eventType },
        },
        {
          email: prefs.email,
          slackWebhookUrl: prefs.slackWebhookUrl,
          notificationWebhookUrl: prefs.notificationWebhookUrl,
        },
        86_400_000,
      )
    }).catch(() => {})
  }

  if (update.paymentFailed) {
    void entitlements.getNotificationPrefs(update.orgId).then((prefs) => {
      sendNotificationDeduped(
        {
          type: 'billing.payment_failed',
          orgId: update.orgId!,
          title: 'Payment failed',
          body: 'A Creem payment for your Sanctum subscription failed. Update your payment method to avoid losing governed actions.',
          severity: 'critical',
          data: { eventType },
        },
        {
          email: prefs.email,
          slackWebhookUrl: prefs.slackWebhookUrl,
          notificationWebhookUrl: prefs.notificationWebhookUrl,
        },
        3_600_000,
      )
    }).catch(() => {})
  }

  markEventProcessed(eventId)
  return reply.status(200).send({ ok: true, eventType, orgId: update.orgId, planId: update.planId })
}

export async function registerBillingRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)
  const usage = getUsageStore(cfg)

  app.get('/v1/billing/creem/config', async (req) => {
    const q = req.query as { org_id?: string }
    const orgId = await resolveOrgId(req as SanctumReq, store, q.org_id)
    return {
      ...creemPublicConfig(),
      orgId,
      webhookUrl: `${process.env.SANCTUM_PUBLIC_API_URL?.replace(/\/$/, '') || ''}/v1/billing/webhook`,
      docs: 'https://docs.creem.io/code/webhooks',
    }
  })

  app.get('/v1/billing/plan', async (req, reply) => {
    const q = req.query as { org_id?: string }
    const orgId = await resolveOrgId(req as SanctumReq, store, q.org_id)
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })

    const [limits, usageSummary, governedUsed, observeUsed] = await Promise.all([
      entitlements.getLimits(orgId),
      usage.summary(orgId, 30),
      entitlements.getMonthlyGovernedCount(orgId),
      entitlements.getMonthlyObserveCount(orgId),
    ])

    const runtimeHoursThisMonth = Math.round((usageSummary.totals['runtime.hours'] ?? 0) * 10) / 10
    const runtimesConnected = await entitlements.getActiveRuntimeCount(orgId)

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

    let creemCustomerId: string | null = null
    let billingCycleAnchor: string | null = null
    let creemSubscriptionId: string | null = null
    try {
      const admin = createSupabaseAdmin(cfg)
      const { data } = await admin
        .from('org_plans')
        .select('creem_customer_id, creem_subscription_id, billing_cycle_anchor')
        .eq('org_id', orgId)
        .maybeSingle()
      creemCustomerId = data?.creem_customer_id ?? null
      creemSubscriptionId = data?.creem_subscription_id ?? null
      billingCycleAnchor = data?.billing_cycle_anchor ?? null
    } catch { /* ignore */ }

    const governedLimit = limits.maxGovernedActionsPerMonth
    const observeLimit = limits.maxObserveEventsPerMonth
    const runtimesLimit = limits.maxRuntimes

    return {
      plan: {
        id: limits.planId,
        name: limits.planName,
        priceMonthlyUsd: limits.priceMonthlyUsd,
      },
      limits: {
        maxRuntimes: limits.maxRuntimes,
        maxEventsPerMonth: limits.maxGovernedActionsPerMonth,
        maxGovernedActionsPerMonth: limits.maxGovernedActionsPerMonth,
        maxObserveEventsPerMonth: limits.maxObserveEventsPerMonth,
        maxAgents: limits.maxAgents,
        retentionDays: limits.retentionDays,
        features: limits.features,
      },
      usage: {
        eventsThisMonth: governedUsed,
        governedActionsThisMonth: governedUsed,
        observeEventsThisMonth: observeUsed,
        runtimesConnected,
        agentsActive,
        runtimeHoursThisMonth,
      },
      quotas: {
        events: {
          used: governedUsed,
          limit: governedLimit,
          pct: governedLimit ? Math.round((governedUsed / governedLimit) * 100) : null,
        },
        governed: {
          used: governedUsed,
          limit: governedLimit,
          pct: governedLimit ? Math.round((governedUsed / governedLimit) * 100) : null,
        },
        observe: {
          used: observeUsed,
          limit: observeLimit,
          pct: observeLimit ? Math.round((observeUsed / observeLimit) * 100) : null,
        },
        runtimes: {
          used: runtimesConnected,
          limit: runtimesLimit,
          pct: runtimesLimit ? Math.round((runtimesConnected / runtimesLimit) * 100) : null,
        },
      },
      billing: {
        billingProvider: creemSubscriptionId || creemCustomerId ? 'creem' : null,
        creemCustomerId,
        creemSubscriptionId,
        billingCycleAnchor,
        creem: creemPublicConfig(),
      },
    }
  })

  app.post('/v1/billing/checkout', async (req, reply) => {
    const body = z.object({
      org_id: z.string().min(1),
      plan_id: z.enum(['personal', 'operator', 'team', 'enterprise']),
      success_url: z.string().url().optional(),
      cancel_url: z.string().url().optional(),
    }).parse(req.body)

    const orgId = await resolveOrgId(req as SanctumReq, store, body.org_id)
    if (!orgId) return reply.status(403).send({ error: 'org_forbidden' })

    if (body.plan_id === 'enterprise') {
      return {
        checkoutUrl: process.env.CREEM_CHECKOUT_ENTERPRISE_URL?.trim() || null,
        billingProvider: process.env.CREEM_CHECKOUT_ENTERPRISE_URL ? 'creem' : null,
        checkoutMode: 'link',
        contactEmail: 'billing@sanctumruntime.com',
        message: 'Contact us for Enterprise pricing and custom terms',
        planId: body.plan_id,
        planName: PLAN_DEFAULTS.enterprise.planName,
        priceMonthlyUsd: null,
      }
    }

    const planId = body.plan_id as PaidPlanId
    const defaults = defaultBillingReturnUrls(resolveDashboardUrl())
    const successUrl = body.success_url ?? defaults.successUrl
    const cancelUrl = body.cancel_url ?? defaults.cancelUrl
    const customerEmail = (req as SanctumReq).sanctumUser?.email

    const productId = creemProductIdForPlan(planId)
    if (getCreemConfig() && productId) {
      try {
        const session = await creemCreateCheckoutSession({
          productId,
          orgId,
          planId,
          successUrl,
          cancelUrl,
          customerEmail,
        })
        return {
          checkoutUrl: session.checkoutUrl,
          billingProvider: 'creem',
          checkoutMode: session.mode,
          planId,
          planName: PLAN_DEFAULTS[planId].planName,
          priceMonthlyUsd: PLAN_DEFAULTS[planId].priceMonthlyUsd,
          message: null,
        }
      } catch (err) {
        app.log.warn({ err, planId, orgId }, '[billing/checkout] Creem API failed, trying static link')
      }
    }

    const linkUrl = staticCreemCheckoutUrl(planId, orgId, { success: successUrl, cancel: cancelUrl })
    if (linkUrl) {
      return {
        checkoutUrl: linkUrl,
        billingProvider: 'creem',
        checkoutMode: 'link',
        planId,
        planName: PLAN_DEFAULTS[planId].planName,
        priceMonthlyUsd: PLAN_DEFAULTS[planId].priceMonthlyUsd,
        message: null,
      }
    }

    return {
      checkoutUrl: null,
      billingProvider: null,
      checkoutMode: null,
      contactEmail: 'billing@sanctumruntime.com',
      message:
        'Creem is not configured. Set CREEM_API_KEY + CREEM_PRODUCT_* (Checkout API) or CREEM_CHECKOUT_*_URL (hosted links). See docs/CREEM_BILLING.md.',
      planId,
      planName: PLAN_DEFAULTS[planId].planName,
      priceMonthlyUsd: PLAN_DEFAULTS[planId].priceMonthlyUsd,
    }
  })

  // Creem webhooks require the raw JSON body for creem-signature verification.
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (req, body, done) => {
        ;(req as SanctumReq).rawBody = body as Buffer
        try {
          done(null, JSON.parse((body as Buffer).toString('utf8')))
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)), undefined)
        }
      },
    )

    webhookScope.post('/v1/billing/webhook', async (req, reply) => {
      return handleCreemWebhook(app, cfg, entitlements, req, reply)
    })
  })
}
