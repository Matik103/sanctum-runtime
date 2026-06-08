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
      'plan_id, creem_customer_id, creem_subscription_id, creem_subscription_status, billing_status, billing_cycle_anchor',
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

  return {
    plan: { id: planId, name: meta.name, priceMonthlyUsd: meta.price },
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
