import { getSupabase } from './supabase'
import { normalizePlanId, type BillingPlan, type PlanId } from './billing'

const PLAN_NAMES: Record<PlanId, { name: string; price: number | null }> = {
  observer: { name: 'Developer', price: null },
  personal: { name: 'Personal', price: 12 },
  operator: { name: 'Operator', price: 59 },
  team: { name: 'Team', price: 299 },
  enterprise: { name: 'Enterprise', price: null },
}

/** Plan + Creem status from Supabase (source of truth after Creem webhook). */
export async function fetchBillingPlanFromSupabase(orgId: string): Promise<Partial<BillingPlan> | null> {
  const sb = getSupabase()
  if (!sb) return null

  const { data: row, error } = await sb
    .from('org_plans')
    .select(
      'plan_id, pending_plan_id, pending_plan_effective_at, creem_customer_id, creem_subscription_id, creem_subscription_status, billing_status, billing_cycle_anchor',
    )
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) return null

  if (!row) {
    return {
      plan: { id: 'observer', name: 'Developer', priceMonthlyUsd: null },
      billing: {
        billingProvider: null,
        creemCustomerId: null,
        creemSubscriptionId: null,
        creemSubscriptionStatus: null,
        billingStatus: null,
        billingCycleAnchor: null,
      },
    }
  }

  const planId = normalizePlanId(row.plan_id as string | undefined)
  const meta = PLAN_NAMES[planId] ?? PLAN_NAMES.observer
  const pendingPlanId = normalizePlanId(row.pending_plan_id as string | undefined)
  const pendingEffectiveAt = row.pending_plan_effective_at as string | null
  const pendingActive = Boolean(
    pendingPlanId
    && pendingPlanId !== planId
    && pendingEffectiveAt
    && new Date(pendingEffectiveAt) > new Date(),
  )
  const pendingMeta = pendingActive ? (PLAN_NAMES[pendingPlanId] ?? PLAN_NAMES.observer) : null

  return {
    plan: { id: planId, name: meta.name, priceMonthlyUsd: meta.price },
    pendingPlan: pendingActive && pendingMeta
      ? { id: pendingPlanId, name: pendingMeta.name, effectiveAt: pendingEffectiveAt! }
      : null,
    billing: {
      billingProvider: row.creem_subscription_id || row.creem_customer_id ? 'creem' : null,
      creemCustomerId: row.creem_customer_id ?? null,
      creemSubscriptionId: row.creem_subscription_id ?? null,
      creemSubscriptionStatus: row.creem_subscription_status ?? null,
      billingStatus: row.billing_status ?? null,
      billingCycleAnchor: row.billing_cycle_anchor ?? null,
    },
  }
}
