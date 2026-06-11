/**
 * Creem subscription APIs — upgrade/downgrade, cancel, customer portal.
 * @see docs/CREEM_BILLING_FLOWS.md
 */
import { creemApiBase } from './creem.ts'
import { productIdFrom } from './creem-parse.ts'

const PLAN_RANK: Record<string, number> = {
  observer: 0,
  personal: 1,
  operator: 2,
  team: 3,
  enterprise: 4,
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'scheduled_cancel',
])

export type CreemCancelMode = 'scheduled' | 'immediate'

export type CreemApiResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; text: string }

export function planRank(planId: string): number {
  return PLAN_RANK[planId] ?? 0
}

export function hasActiveCreemSubscription(
  currentPlanId: string | null | undefined,
  subscriptionId: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  if (!subscriptionId?.trim()) return false
  if (!currentPlanId || planRank(currentPlanId) < 1) return false
  const status = (subscriptionStatus ?? 'active').toLowerCase()
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status)
}

/** Upgrade OR downgrade between paid products (same Creem endpoint). */
export async function creemChangeSubscriptionPlan(
  apiKey: string,
  subscriptionId: string,
  productId: string,
  updateBehavior: 'proration-charge-immediately' | 'proration-none' = 'proration-charge-immediately',
): Promise<CreemApiResult> {
  const res = await fetch(
    `${creemApiBase()}/v1/subscriptions/${encodeURIComponent(subscriptionId)}/upgrade`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        product_id: productId,
        update_behavior: updateBehavior,
      }),
      signal: AbortSignal.timeout(12_000),
    },
  )
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text }
  try {
    return { ok: true, body: JSON.parse(text) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 502, text: 'invalid_json' }
  }
}

/** Cancel subscription — use scheduled to keep access until period end. */
export async function creemCancelSubscription(
  apiKey: string,
  subscriptionId: string,
  mode: CreemCancelMode = 'scheduled',
): Promise<CreemApiResult> {
  const res = await fetch(
    `${creemApiBase()}/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(12_000),
    },
  )
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text }
  try {
    return { ok: true, body: JSON.parse(text) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 502, text: 'invalid_json' }
  }
}

/** Retrieve subscription — Creem uses query param, not path segment. */
export async function creemGetSubscription(
  apiKey: string,
  subscriptionId: string,
): Promise<CreemApiResult> {
  const url = `${creemApiBase()}/v1/subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(12_000),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text }
  try {
    return { ok: true, body: JSON.parse(text) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 502, text: 'invalid_json' }
  }
}

/** Customer self-service portal (payment method, cancel, invoices). */
export async function creemCustomerPortalLink(
  apiKey: string,
  customerId: string,
): Promise<CreemApiResult & { portalUrl?: string }> {
  const res = await fetch(`${creemApiBase()}/v1/customers/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ customer_id: customerId }),
    signal: AbortSignal.timeout(12_000),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, text }
  try {
    const body = JSON.parse(text) as Record<string, unknown>
    const portalUrl =
      (typeof body.customer_portal_link === 'string' && body.customer_portal_link)
      || (typeof body.customerPortalLink === 'string' && body.customerPortalLink)
      || null
    if (!portalUrl) return { ok: false, status: 502, text: 'missing_portal_link' }
    return { ok: true, body, portalUrl }
  } catch {
    return { ok: false, status: 502, text: 'invalid_json' }
  }
}

export function planIdFromSubscription(
  sub: Record<string, unknown>,
  map: Record<string, string>,
): string | null {
  const pid = productIdFrom(sub)
  if (pid && map[pid]) return map[pid]
  return null
}

/** After a successful Creem subscription change, trust the user's chosen target. */
export function resolvePlanAfterSubscriptionChange(
  targetPlanId: string,
  _creemBody: Record<string, unknown>,
  _map: Record<string, string>,
): string {
  // Creem responses may briefly echo the previous product on upgrades and downgrades.
  return targetPlanId
}

/** Billing period end from a Creem subscription object (ISO timestamptz). */
export function periodEndFromSubscription(sub: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    sub.current_period_end_date,
    sub.currentPeriodEndDate,
    sub.current_period_end,
    sub.currentPeriodEnd,
    sub.next_billing_date,
    sub.nextBillingDate,
  ]
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) {
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
    if (typeof raw === 'number' && raw > 0) {
      const ms = raw > 1e12 ? raw : raw * 1000
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

export function planChangeType(
  fromPlanId: string,
  toPlanId: string,
): 'upgrade' | 'downgrade' | 'same' | 'cancel' {
  if (toPlanId === 'observer') return 'cancel'
  const from = planRank(fromPlanId)
  const to = planRank(toPlanId)
  if (to > from) return 'upgrade'
  if (to < from) return 'downgrade'
  return 'same'
}
