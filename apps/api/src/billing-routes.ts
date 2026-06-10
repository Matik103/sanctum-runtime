import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig, createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine, PLAN_DEFAULTS, type PlanId } from './entitlements.js'
import { getUsageStore } from './usage-store.js'
import { sendNotificationDeduped } from './notifications.js'
import type { SupabaseAuthConfig } from './auth.js'
import {
  verifyCreemSignature,
  resolveCreemPlanUpdate,
  resolveCreemPlanFromObject,
  customerEmailFromCreemObject,
  type CreemWebhookEvent,
} from './creem-billing.js'
import {
  creemCreateCheckoutSession,
  creemGetCheckout,
  creemHostedPaymentUrl,
  creemProductIdForPlan,
  creemPublicConfig,
  defaultBillingReturnUrls,
  getCreemConfig,
  type PaidPlanId,
} from './creem-client.js'
import { resolveDashboardUrl } from '../../../scripts/env.ts'
import {
  loadProfileBillingStatus,
  resolveBillingOrgId,
  setProfileBillingOrg,
} from './billing-org.js'

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
    const admin = createSupabaseAdmin(cfg)
    return resolveBillingOrgId(store, admin, req.sanctumUser.id, qOrgId)
  }
  if (req.sanctumApiKeyScope !== undefined) return req.sanctumApiKeyScope[0] ?? null
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) return store.getApiKeyOrgId(key)
  return null
}

function staticCreemCheckoutUrl(
  planId: PaidPlanId,
  orgId: string,
  urls: { success?: string; cancel?: string; baseUrl?: string },
): string | null {
  const envMap: Record<PaidPlanId, string | undefined> = {
    personal: process.env.CREEM_CHECKOUT_PERSONAL_URL,
    operator: process.env.CREEM_CHECKOUT_OPERATOR_URL,
    team: process.env.CREEM_CHECKOUT_TEAM_URL,
  }
  const base = urls.baseUrl ?? envMap[planId]?.trim()
  if (!base) return null
  const checkout = new URL(base)
  checkout.searchParams.set('org_id', orgId)
  checkout.searchParams.set('plan', planId)
  checkout.searchParams.set('request_id', orgId)
  if (urls.success) checkout.searchParams.set('success_url', urls.success)
  if (urls.cancel) checkout.searchParams.set('cancel_url', urls.cancel)
  return checkout.toString()
}

type CreemPlanPatch = {
  orgId: string
  planId?: PlanId | null
  customerId?: string | null
  subscriptionId?: string | null
  subscriptionStatus?: string | null
  billingStatus?: 'active' | 'payment_failed' | 'canceled' | null
  revoke?: boolean
}

async function resolveOrgIdForCreemBilling(
  admin: ReturnType<typeof createSupabaseAdmin>,
  hint: {
    orgId: string | null
    customerId: string | null
    customerEmail: string | null
  },
): Promise<string | null> {
  if (hint.orgId) return hint.orgId

  if (hint.customerId) {
    const { data } = await admin
      .from('org_plans')
      .select('org_id')
      .eq('creem_customer_id', hint.customerId)
      .maybeSingle()
    if (data?.org_id) return data.org_id as string
  }

  if (hint.customerEmail) {
    const email = hint.customerEmail.trim().toLowerCase()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, billing_org_id')
      .ilike('email', email)
      .maybeSingle()
    if (profile?.billing_org_id) {
      const linked = profile.billing_org_id as string
      const { data: mem } = await admin
        .from('organization_members')
        .select('org_id')
        .eq('user_id', profile.id)
        .eq('org_id', linked)
        .maybeSingle()
      if (mem?.org_id) return linked
    }
    if (profile?.id) {
      const { data: memberships } = await admin
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', profile.id)
      const preferred =
        memberships?.find((m) => m.org_id === profile.billing_org_id)
        ?? memberships?.find((m) => !String(m.org_id).startsWith('personal-') && m.role === 'owner')
        ?? memberships?.find((m) => m.org_id.startsWith('personal-'))
        ?? memberships?.[0]
      if (preferred?.org_id) return preferred.org_id as string
    }
  }

  return null
}

async function upsertOrgPlanFromCreem(
  admin: ReturnType<typeof createSupabaseAdmin>,
  entitlements: ReturnType<typeof getEntitlementEngine>,
  patch: CreemPlanPatch,
): Promise<{ error: string | null }> {
  await entitlements.ensureOrgPlan(patch.orgId)

  const row: Record<string, unknown> = {
    org_id: patch.orgId,
    updated_at: new Date().toISOString(),
  }
  if (patch.planId) row.plan_id = patch.planId
  if (patch.customerId) row.creem_customer_id = patch.customerId
  if (patch.subscriptionId) row.creem_subscription_id = patch.subscriptionId
  if (patch.subscriptionStatus) row.creem_subscription_status = patch.subscriptionStatus
  if (patch.billingStatus) row.billing_status = patch.billingStatus
  if (patch.planId && !patch.revoke) {
    row.billing_cycle_anchor = new Date().toISOString()
  }

  const { error } = await admin.from('org_plans').upsert(row, { onConflict: 'org_id' })
  return { error: error?.message ?? null }
}

async function applyCreemGrantFromCheckoutObject(
  cfg: SupabaseAuthConfig,
  entitlements: ReturnType<typeof getEntitlementEngine>,
  checkoutObj: Record<string, unknown>,
  orgIdHint: string | null,
): Promise<{ ok: boolean; orgId: string | null; planId: PlanId | null; error?: string }> {
  const resolved = resolveCreemPlanFromObject(checkoutObj, { grant: true })
  const admin = createSupabaseAdmin(cfg)
  const orgId = await resolveOrgIdForCreemBilling(admin, {
    orgId: orgIdHint ?? resolved.orgId,
    customerId: resolved.customerId,
    customerEmail: customerEmailFromCreemObject(checkoutObj),
  })
  if (!orgId) return { ok: false, orgId: null, planId: null, error: 'org_unresolved' }
  if (!resolved.planId || resolved.grantFailed) {
    return { ok: false, orgId, planId: null, error: 'plan_unresolved' }
  }

  const { error } = await upsertOrgPlanFromCreem(admin, entitlements, {
    orgId,
    planId: resolved.planId,
    customerId: resolved.customerId,
    subscriptionId: resolved.subscriptionId,
    subscriptionStatus: resolved.subscriptionStatus ?? 'active',
    billingStatus: 'active',
  })
  if (error) return { ok: false, orgId, planId: resolved.planId, error }

  await setProfileBillingOrg(admin, orgId, {
    customerEmail: customerEmailFromCreemObject(checkoutObj) ?? undefined,
  })
  return { ok: true, orgId, planId: resolved.planId }
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
  const admin = createSupabaseAdmin(cfg)
  const orgId = await resolveOrgIdForCreemBilling(admin, {
    orgId: update.orgId,
    customerId: update.customerId,
    customerEmail: update.customerEmail,
  })

  const grantEvents = new Set([
    'checkout.completed',
    'subscription.paid',
    'subscription.active',
    'subscription.trialing',
  ])

  if (!orgId && grantEvents.has(eventType ?? '')) {
    app.log.error(
      { eventType, eventId, customerEmail: update.customerEmail, customerId: update.customerId },
      '[billing/webhook] grant event could not resolve org — add org_id metadata to checkout or CREEM_PRODUCT_* on API',
    )
    return reply.status(500).send({
      error: 'org_unresolved',
      eventType,
      hint:
        'Checkout must include metadata.org_id (use dashboard Billing → Upgrade) or match customer email to a Sanctum owner.',
    })
  }

  if (!orgId) {
    markEventProcessed(eventId)
    return reply.status(200).send({ ok: true, note: 'no org resolved — skipped' })
  }

  if (update.grantFailed) {
    app.log.error(
      { orgId, eventType, eventId },
      '[billing/webhook] grant event missing plan — set CREEM_PRODUCT_* or pass metadata.plan',
    )
    return reply.status(500).send({
      error: 'grant_plan_unresolved',
      orgId,
      eventType,
      hint: 'Billing could not match this payment to a plan. Contact billing@sanctumruntime.com and we will reconcile it.',
    })
  }

  if (update.shouldUpsertPlan && update.planId) {
    const { error } = await upsertOrgPlanFromCreem(admin, entitlements, {
      orgId,
      planId: update.planId,
      customerId: update.customerId,
      subscriptionId: update.subscriptionId,
      subscriptionStatus: update.subscriptionStatus,
      billingStatus: update.billingStatus ?? 'active',
      revoke: update.revoke,
    })

    if (error) {
      app.log.error({ err: error }, '[billing/webhook] upsert failed')
      return reply.status(500).send({ error: 'db_error' })
    }

    app.log.info({ orgId, planId: update.planId, revoke: update.revoke }, '[billing/webhook] plan updated')

    await setProfileBillingOrg(admin, orgId, { customerEmail: update.customerEmail ?? undefined })

    void entitlements.getNotificationPrefs(orgId).then((prefs) => {
      sendNotificationDeduped(
        {
          type: 'billing.plan_changed',
          orgId,
          title: `Plan updated: ${update.planId}`,
          body: update.revoke
            ? 'Your Sanctum subscription ended. You are on the Developer plan (observe-only).'
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
  } else if (update.shouldSyncStatusOnly) {
    const { error } = await upsertOrgPlanFromCreem(admin, entitlements, {
      orgId,
      customerId: update.customerId,
      subscriptionId: update.subscriptionId,
      subscriptionStatus: update.subscriptionStatus,
      billingStatus: update.billingStatus ?? undefined,
    })
    if (error) {
      app.log.error({ err: error }, '[billing/webhook] status sync failed')
      return reply.status(500).send({ error: 'db_error' })
    }
    app.log.info({ orgId, subscriptionStatus: update.subscriptionStatus }, '[billing/webhook] status synced')
  }

  if (update.paymentFailed) {
    void entitlements.getNotificationPrefs(orgId).then((prefs) => {
      sendNotificationDeduped(
        {
          type: 'billing.payment_failed',
          orgId,
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
  return reply.status(200).send({ ok: true, eventType, orgId, planId: update.planId })
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

    const [limits, usageSummary, governedUsed, observeUsed, runtimesConnected, agentsActive] =
      await Promise.all([
        entitlements.getLimits(orgId),
        usage.summary(orgId, 30),
        entitlements.getMonthlyGovernedCount(orgId),
        entitlements.getMonthlyObserveCount(orgId),
        entitlements.getActiveRuntimeCount(orgId),
        entitlements.getActiveAgentCount(orgId),
      ])

    const runtimeHoursThisMonth = Math.round((usageSummary.totals['runtime.hours'] ?? 0) * 10) / 10

    let creemCustomerId: string | null = null
    let billingCycleAnchor: string | null = null
    let creemSubscriptionId: string | null = null
    let creemSubscriptionStatus: string | null = null
    let billingStatus: string | null = null
    try {
      const admin = createSupabaseAdmin(cfg)
      const { data } = await admin
        .from('org_plans')
        .select(
          'creem_customer_id, creem_subscription_id, creem_subscription_status, billing_status, billing_cycle_anchor',
        )
        .eq('org_id', orgId)
        .maybeSingle()
      creemCustomerId = data?.creem_customer_id ?? null
      creemSubscriptionId = data?.creem_subscription_id ?? null
      creemSubscriptionStatus = data?.creem_subscription_status ?? null
      billingStatus = data?.billing_status ?? null
      billingCycleAnchor = data?.billing_cycle_anchor ?? null
    } catch { /* ignore */ }

    const governedLimit = limits.maxGovernedActionsPerMonth
    const observeLimit = limits.maxObserveEventsPerMonth
    const runtimesLimit = limits.maxRuntimes
    const agentsLimit = limits.maxAgents

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
        agents: {
          used: agentsActive,
          limit: agentsLimit,
          pct: agentsLimit ? Math.round((agentsActive / agentsLimit) * 100) : null,
        },
      },
      billing: {
        billingProvider: creemSubscriptionId || creemCustomerId ? 'creem' : null,
        creemCustomerId,
        creemSubscriptionId,
        creemSubscriptionStatus,
        billingStatus,
        billingCycleAnchor,
        creem: creemPublicConfig(),
      },
    }
  })

  app.post('/v1/billing/sync', async (req, reply) => {
    const body = z
      .object({
        org_id: z.string().min(1),
        checkout_id: z.string().min(1).optional(),
      })
      .parse(req.body)

    const orgId = await resolveOrgId(req as SanctumReq, store, body.org_id)
    if (!orgId) return reply.status(403).send({ error: 'org_forbidden' })

    if (body.checkout_id && getCreemConfig()) {
      const checkout = await creemGetCheckout(body.checkout_id)
      if (checkout) {
        const result = await applyCreemGrantFromCheckoutObject(cfg, entitlements, checkout, orgId)
        if (result.ok) {
          return {
            ok: true,
            synced: true,
            orgId: result.orgId,
            planId: result.planId,
            source: 'creem_checkout',
          }
        }
        app.log.warn({ orgId, checkoutId: body.checkout_id, error: result.error }, '[billing/sync] checkout reconcile failed')
      }
    }

    await entitlements.ensureOrgPlan(orgId)
    const admin = createSupabaseAdmin(cfg)
    const { data } = await admin
      .from('org_plans')
      .select('plan_id, creem_subscription_id, creem_subscription_status, billing_status')
      .eq('org_id', orgId)
      .maybeSingle()

    return {
      ok: true,
      synced: false,
      orgId,
      planId: data?.plan_id ?? 'observer',
      creemSubscriptionId: data?.creem_subscription_id ?? null,
      creemSubscriptionStatus: data?.creem_subscription_status ?? null,
      billingStatus: data?.billing_status ?? null,
      note: body.checkout_id
        ? 'Webhook may still be processing; refresh again in a few seconds.'
        : 'No checkout_id provided; returned current org_plans row.',
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
    const dashboard = resolveDashboardUrl()
    const defaults = defaultBillingReturnUrls(dashboard)
    const successBase = new URL(defaults.successUrl)
    successBase.searchParams.set('org_id', orgId)
    const successUrl = body.success_url ?? successBase.toString()
    const cancelUrl = body.cancel_url ?? defaults.cancelUrl

    if (req.sanctumUser) {
      const admin = createSupabaseAdmin(cfg)
      await setProfileBillingOrg(admin, orgId, { userId: req.sanctumUser.id })
    }
    const customerEmail = (req as SanctumReq).sanctumUser?.email

    const productId = creemProductIdForPlan(planId)
    if (getCreemConfig() && productId) {
      try {
        const session = await creemCreateCheckoutSession({
          productId,
          orgId,
          planId,
          successUrl,
          customerEmail,
        })
        return {
          checkoutUrl: session.checkoutUrl,
          billingProvider: 'creem',
          checkoutMode: session.mode,
          checkoutId: session.checkoutId ?? null,
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

    // Product IDs only (no API key): use Creem hosted test/live payment pages.
    if (productId) {
      const hosted = staticCreemCheckoutUrl(planId, orgId, {
        success: successUrl,
        cancel: cancelUrl,
        baseUrl: creemHostedPaymentUrl(productId),
      })
      if (hosted) {
        return {
          checkoutUrl: hosted,
          billingProvider: 'creem',
          checkoutMode: 'link',
          planId,
          planName: PLAN_DEFAULTS[planId].planName,
          priceMonthlyUsd: PLAN_DEFAULTS[planId].priceMonthlyUsd,
          message: getCreemConfig()
            ? null
            : 'Using hosted Creem checkout. Add CREEM_API_KEY on the API for metadata-rich checkout and reliable webhooks.',
        }
      }
    }

    return {
      checkoutUrl: null,
      billingProvider: null,
      checkoutMode: null,
      contactEmail: 'billing@sanctumruntime.com',
      message:
        'Billing checkout is not ready for this plan yet. Contact billing@sanctumruntime.com and we will move the workspace for you.',
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

    webhookScope.post('/v1/billing/webhook', async (_req, reply) => {
      return reply.status(410).send({
        error: 'webhook_deprecated',
        message:
          'Register Creem webhooks at your Supabase project: /functions/v1/creem-webhook. '
          + 'This Render endpoint is no longer active.',
      })
    })
  })
}
