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

export function orgIdFromCreemObject(obj: Record<string, unknown>): string | null {
  const meta = metadataFromObject(obj)
  const candidates = [
    meta.org_id,
    meta.orgId,
    meta.referenceId,
    obj.request_id,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return null
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
  revoke: boolean
  paymentFailed: boolean
  shouldUpsertPlan: boolean
  /** Grant event received but plan could not be resolved (missing metadata + product map). */
  grantFailed: boolean
} {
  const eventType = event.eventType ?? ''
  const obj = normalizeCreemWebhookObject(event)
  const orgId = orgIdFromCreemObject(obj)
  const meta = metadataFromObject(obj)
  const productId = productIdFromObject(obj)

  const planId = planIdFromCreemMetadata(meta) ?? planIdFromCreemProduct(productId)
  const grantEvents = new Set(['checkout.completed', 'subscription.paid'])
  const revokeEvents = new Set([
    'subscription.canceled',
    'subscription.cancelled',
    'subscription.expired',
    'subscription.paused',
  ])

  const customer = obj.customer
  const customerId =
    typeof customer === 'string'
      ? customer
      : customer && typeof customer === 'object'
        ? String((customer as { id?: string }).id ?? '') || null
        : null

  const subscription = obj.subscription
  const subscriptionId =
    typeof subscription === 'string'
      ? subscription
      : subscription && typeof subscription === 'object'
        ? String((subscription as { id?: string }).id ?? '') || null
        : obj.object === 'subscription' && typeof obj.id === 'string'
          ? obj.id
          : null

  if (revokeEvents.has(eventType)) {
    return {
      orgId,
      planId: 'observer',
      customerId,
      subscriptionId,
      revoke: true,
      paymentFailed: false,
      shouldUpsertPlan: Boolean(orgId),
      grantFailed: false,
    }
  }

  if (eventType === 'subscription.past_due') {
    return {
      orgId,
      planId,
      customerId,
      subscriptionId,
      revoke: false,
      paymentFailed: true,
      shouldUpsertPlan: false,
      grantFailed: false,
    }
  }

  if (grantEvents.has(eventType)) {
    if (!orgId) {
      return {
        orgId: null,
        planId: null,
        customerId,
        subscriptionId,
        revoke: false,
        paymentFailed: false,
        shouldUpsertPlan: false,
        grantFailed: false,
      }
    }
    if (!planId) {
      return {
        orgId,
        planId: null,
        customerId,
        subscriptionId,
        revoke: false,
        paymentFailed: false,
        shouldUpsertPlan: false,
        grantFailed: true,
      }
    }
    return {
      orgId,
      planId,
      customerId,
      subscriptionId,
      revoke: false,
      paymentFailed: false,
      shouldUpsertPlan: true,
      grantFailed: false,
    }
  }

  return {
    orgId,
    planId: null,
    customerId,
    subscriptionId,
    revoke: false,
    paymentFailed: false,
    shouldUpsertPlan: false,
    grantFailed: false,
  }
}
