import { createHmac, timingSafeEqual } from 'crypto'
import type { PlanId } from './entitlements.js'

/** Creem webhook envelope. See https://docs.creem.io/code/webhooks */
export type CreemWebhookEvent = {
  id?: string
  eventType?: string
  created_at?: number
  object?: Record<string, unknown>
}

export function verifyCreemSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.trim() || !secret.trim()) return false
  const raw = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHeader.trim(), 'hex'))
  } catch {
    return false
  }
}

/** Checkout vs subscription payloads use different object shapes. */
export function normalizeCreemWebhookObject(event: CreemWebhookEvent): Record<string, unknown> {
  const obj = (event.object ?? {}) as Record<string, unknown>
  const eventType = event.eventType ?? ''
  if (obj.object === 'subscription' || eventType.startsWith('subscription.')) {
    return obj
  }
  return obj
}

function productIdFromObject(obj: Record<string, unknown>): string | null {
  const product = obj.product
  if (typeof product === 'string' && product) return product
  if (product && typeof product === 'object' && 'id' in product) {
    return String((product as { id?: string }).id ?? '') || null
  }
  const order = obj.order
  if (order && typeof order === 'object' && 'product' in order) {
    const p = (order as { product?: string }).product
    if (p) return p
  }
  const subscription = obj.subscription
  if (subscription && typeof subscription === 'object') {
    const sub = subscription as { product?: string | { id?: string } }
    if (typeof sub.product === 'string') return sub.product
    if (sub.product && typeof sub.product === 'object' && sub.product.id) {
      return sub.product.id
    }
  }
  return null
}

function metadataFromObject(obj: Record<string, unknown>): Record<string, unknown> {
  const layers: Record<string, unknown>[] = []
  const direct = obj.metadata
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    layers.push(direct as Record<string, unknown>)
  }
  const order = obj.order
  if (order && typeof order === 'object' && !Array.isArray(order)) {
    const orderMeta = (order as { metadata?: Record<string, unknown> }).metadata
    if (orderMeta && typeof orderMeta === 'object') layers.push(orderMeta)
  }
  const subscription = obj.subscription
  if (subscription && typeof subscription === 'object' && !Array.isArray(subscription)) {
    const subMeta = (subscription as { metadata?: Record<string, unknown> }).metadata
    if (subMeta && typeof subMeta === 'object') layers.push(subMeta)
  }
  const merged: Record<string, unknown> = {}
  for (const layer of layers.reverse()) {
    Object.assign(merged, layer)
  }
  return merged
}

export function customerEmailFromCreemObject(obj: Record<string, unknown>): string | null {
  const customer = obj.customer
  if (customer && typeof customer === 'object' && !Array.isArray(customer)) {
    const email = (customer as { email?: string }).email
    if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase()
  }
  return null
}

export function customerIdFromCreemObject(obj: Record<string, unknown>): string | null {
  const customer = obj.customer
  if (typeof customer === 'string' && customer) return customer
  if (customer && typeof customer === 'object' && !Array.isArray(customer)) {
    const id = (customer as { id?: string }).id
    if (typeof id === 'string' && id) return id
  }
  const order = obj.order
  if (order && typeof order === 'object' && !Array.isArray(order)) {
    const c = (order as { customer?: string }).customer
    if (typeof c === 'string' && c) return c
  }
  return null
}

export function subscriptionStatusFromCreemObject(obj: Record<string, unknown>): string | null {
  const status = obj.status
  if (typeof status === 'string' && status.trim()) return status.trim()
  const subscription = obj.subscription
  if (subscription && typeof subscription === 'object' && !Array.isArray(subscription)) {
    const subStatus = (subscription as { status?: string }).status
    if (typeof subStatus === 'string' && subStatus.trim()) return subStatus.trim()
  }
  return null
}

export function orgIdFromCreemObject(obj: Record<string, unknown>): string | null {
  const meta = metadataFromObject(obj)
  const candidates = [
    meta.org_id,
    meta.orgId,
    meta.referenceId,
    meta.reference_id,
    meta.internal_customer_id,
    obj.request_id,
    obj.reference_id,
    obj.referenceId,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return null
}

/** Build plan update from a Creem checkout or subscription object (API sync + webhooks). */
export function resolveCreemPlanFromObject(
  obj: Record<string, unknown>,
  opts: { grant?: boolean; revoke?: boolean } = {},
): {
  orgId: string | null
  planId: PlanId | null
  customerId: string | null
  subscriptionId: string | null
  subscriptionStatus: string | null
  grantFailed: boolean
} {
  const meta = metadataFromObject(obj)
  const productId = productIdFromObject(obj)
  const planId = planIdFromCreemMetadata(meta) ?? planIdFromCreemProduct(productId)
  const orgId = orgIdFromCreemObject(obj)
  const customerId = customerIdFromCreemObject(obj)
  const subscription = obj.subscription
  const subscriptionId =
    typeof subscription === 'string'
      ? subscription
      : subscription && typeof subscription === 'object'
        ? String((subscription as { id?: string }).id ?? '') || null
        : obj.object === 'subscription' && typeof obj.id === 'string'
          ? obj.id
          : null
  const subscriptionStatus = subscriptionStatusFromCreemObject(obj)
  const grantFailed = Boolean(opts.grant && orgId && !planId)
  return {
    orgId,
    planId: opts.revoke ? 'observer' : planId,
    customerId,
    subscriptionId,
    subscriptionStatus,
    grantFailed,
  }
}

export function planIdFromCreemProduct(productId: string | null): PlanId | null {
  if (!productId) return null
  const map: Record<string, PlanId> = {}
  const pairs: [string | undefined, PlanId][] = [
    [process.env.CREEM_PRODUCT_PERSONAL, 'personal'],
    [process.env.CREEM_PRODUCT_OPERATOR, 'operator'],
    [process.env.CREEM_PRODUCT_TEAM, 'team'],
    [process.env.CREEM_PRODUCT_ENTERPRISE, 'enterprise'],
  ]
  for (const [envId, plan] of pairs) {
    if (envId?.trim()) map[envId.trim()] = plan
  }
  return map[productId] ?? null
}

export function planIdFromCreemMetadata(meta: Record<string, unknown>): PlanId | null {
  const plan = meta.plan ?? meta.plan_id
  if (typeof plan === 'string' && ['personal', 'operator', 'team', 'enterprise'].includes(plan)) {
    return plan as PlanId
  }
  return null
}

/**
 * Map Creem webhook → org plan update.
 * Grant access on checkout.completed and subscription.paid (Creem recommendation).
 */
export function resolveCreemPlanUpdate(event: CreemWebhookEvent): {
  orgId: string | null
  planId: PlanId | null
  customerId: string | null
  subscriptionId: string | null
  subscriptionStatus: string | null
  customerEmail: string | null
  revoke: boolean
  paymentFailed: boolean
  shouldUpsertPlan: boolean
  shouldSyncStatusOnly: boolean
  billingStatus: 'active' | 'payment_failed' | 'canceled' | null
  /** Grant event received but plan could not be resolved (missing metadata + product map). */
  grantFailed: boolean
} {
  const eventType = event.eventType ?? ''
  const obj = normalizeCreemWebhookObject(event)
  const grantEvents = new Set([
    'checkout.completed',
    'subscription.paid',
    'subscription.active',
    'subscription.trialing',
  ])
  const revokeEvents = new Set([
    'subscription.canceled',
    'subscription.cancelled',
    'subscription.expired',
    'subscription.paused',
  ])
  const statusOnlyEvents = new Set(['subscription.scheduled_cancel'])

  const base = resolveCreemPlanFromObject(obj)
  const customerEmail = customerEmailFromCreemObject(obj)

  if (revokeEvents.has(eventType)) {
    return {
      orgId: base.orgId,
      planId: 'observer',
      customerId: base.customerId,
      subscriptionId: base.subscriptionId,
      subscriptionStatus: base.subscriptionStatus ?? 'canceled',
      customerEmail,
      revoke: true,
      paymentFailed: false,
      shouldUpsertPlan: Boolean(base.orgId),
      shouldSyncStatusOnly: false,
      billingStatus: 'canceled',
      grantFailed: false,
    }
  }

  if (eventType === 'subscription.past_due') {
    return {
      orgId: base.orgId,
      planId: base.planId,
      customerId: base.customerId,
      subscriptionId: base.subscriptionId,
      subscriptionStatus: 'past_due',
      customerEmail,
      revoke: false,
      paymentFailed: true,
      shouldUpsertPlan: false,
      shouldSyncStatusOnly: Boolean(base.orgId),
      billingStatus: 'payment_failed',
      grantFailed: false,
    }
  }

  if (statusOnlyEvents.has(eventType)) {
    return {
      orgId: base.orgId,
      planId: base.planId,
      customerId: base.customerId,
      subscriptionId: base.subscriptionId,
      subscriptionStatus: base.subscriptionStatus ?? 'scheduled_cancel',
      customerEmail,
      revoke: false,
      paymentFailed: false,
      shouldUpsertPlan: false,
      shouldSyncStatusOnly: Boolean(base.orgId),
      billingStatus: 'active',
      grantFailed: false,
    }
  }

  if (grantEvents.has(eventType)) {
    const resolved = resolveCreemPlanFromObject(obj, { grant: true })
    if (!resolved.orgId) {
      return {
        orgId: null,
        planId: null,
        customerId: resolved.customerId,
        subscriptionId: resolved.subscriptionId,
        subscriptionStatus: resolved.subscriptionStatus,
        customerEmail,
        revoke: false,
        paymentFailed: false,
        shouldUpsertPlan: false,
        shouldSyncStatusOnly: false,
        billingStatus: null,
        grantFailed: false,
      }
    }
    if (resolved.grantFailed || !resolved.planId) {
      return {
        orgId: resolved.orgId,
        planId: null,
        customerId: resolved.customerId,
        subscriptionId: resolved.subscriptionId,
        subscriptionStatus: resolved.subscriptionStatus,
        customerEmail,
        revoke: false,
        paymentFailed: false,
        shouldUpsertPlan: false,
        shouldSyncStatusOnly: false,
        billingStatus: null,
        grantFailed: true,
      }
    }
    return {
      orgId: resolved.orgId,
      planId: resolved.planId,
      customerId: resolved.customerId,
      subscriptionId: resolved.subscriptionId,
      subscriptionStatus: resolved.subscriptionStatus ?? 'active',
      customerEmail,
      revoke: false,
      paymentFailed: false,
      shouldUpsertPlan: true,
      shouldSyncStatusOnly: false,
      billingStatus: 'active',
      grantFailed: false,
    }
  }

  return {
    orgId: base.orgId,
    planId: base.planId,
    customerId: base.customerId,
    subscriptionId: base.subscriptionId,
    subscriptionStatus: base.subscriptionStatus,
    customerEmail,
    revoke: false,
    paymentFailed: false,
    shouldUpsertPlan: false,
    shouldSyncStatusOnly: Boolean(base.orgId && base.subscriptionStatus),
    billingStatus: null,
    grantFailed: false,
  }
}
