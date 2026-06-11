/**
 * Shared org_plans updates for Creem Edge Functions (webhook + sync).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { planRank } from './creem-subscription.ts'

type Admin = SupabaseClient

const ORG_PLAN_SELECT =
  'plan_id, pending_plan_id, pending_plan_effective_at, creem_subscription_id, creem_subscription_status, billing_status, creem_customer_id, billing_cycle_anchor'

/** Map legacy/free ids to observer (product label: Developer). */
export function normalizePlanId(raw: string | null | undefined): string {
  if (!raw || raw === 'free' || raw === 'developer') return 'observer'
  if (raw === 'observer' || raw === 'personal' || raw === 'operator' || raw === 'team' || raw === 'enterprise') {
    return raw
  }
  return 'observer'
}

/** Every workspace must have org_plans before checkout or billing UI. */
export async function ensureOrgPlan(admin: Admin, orgId: string): Promise<void> {
  const { data } = await admin.from('org_plans').select('org_id').eq('org_id', orgId).maybeSingle()
  if (data) return
  const now = new Date().toISOString()
  const { error } = await admin.from('org_plans').insert({
    org_id: orgId,
    plan_id: 'observer',
    updated_at: now,
  })
  if (error && error.code !== '23505') {
    throw new Error(`ensure_org_plan_failed:${error.message}`)
  }
}

export async function claimCreemWebhookEvent(
  admin: Admin,
  eventId: string | undefined,
  eventType: string,
  orgId: string | null,
): Promise<boolean> {
  if (!eventId?.trim()) return true
  const { error } = await admin.from('creem_webhook_events').insert({
    event_id: eventId.trim(),
    event_type: eventType,
    org_id: orgId,
  })
  if (error?.code === '23505') return false
  if (error) throw new Error(`webhook_idempotency_failed:${error.message}`)
  return true
}

export async function linkBillingOrg(admin: Admin, orgId: string, email: string | null) {
  const ids = new Set<string>()
  if (email) {
    const { data: p } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (p?.id) ids.add(p.id as string)
  }
  const { data: owners } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])
  for (const o of owners ?? []) if (o.user_id) ids.add(o.user_id as string)
  const now = new Date().toISOString()
  for (const id of ids) {
    await admin.from('profiles').update({ billing_org_id: orgId, updated_at: now }).eq('id', id)
  }
}

/** Apply pending downgrade when the billing period has ended. */
export async function applyPendingPlanIfDue(admin: Admin, orgId: string): Promise<boolean> {
  const { data: row } = await admin
    .from('org_plans')
    .select('plan_id, pending_plan_id, pending_plan_effective_at')
    .eq('org_id', orgId)
    .maybeSingle()

  const pending = normalizePlanId(row?.pending_plan_id as string | undefined)
  const effectiveAt = row?.pending_plan_effective_at as string | null | undefined
  if (!pending || pending === 'observer' || !effectiveAt) return false

  if (new Date(effectiveAt) > new Date()) return false

  const now = new Date().toISOString()
  await admin.from('org_plans').update({
    plan_id: pending,
    pending_plan_id: null,
    pending_plan_effective_at: null,
    updated_at: now,
  }).eq('org_id', orgId)
  return true
}

/** Keep higher-tier entitlements until period end; Creem billing already moved to pending tier. */
export async function schedulePlanDowngrade(
  admin: Admin,
  input: {
    orgId: string
    entitlementPlanId: string
    pendingPlanId: string
    effectiveAt: string
    customerId: string | null
    subscriptionId: string | null
    email: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('org_plans').upsert({
    org_id: input.orgId,
    plan_id: normalizePlanId(input.entitlementPlanId),
    pending_plan_id: normalizePlanId(input.pendingPlanId),
    pending_plan_effective_at: input.effectiveAt,
    creem_customer_id: input.customerId,
    creem_subscription_id: input.subscriptionId,
    creem_subscription_status: 'active',
    billing_status: 'active',
    updated_at: now,
  }, { onConflict: 'org_id' })
  await linkBillingOrg(admin, input.orgId, input.email)
}

export async function clearPendingPlanDowngrade(admin: Admin, orgId: string): Promise<void> {
  await admin.from('org_plans').update({
    pending_plan_id: null,
    pending_plan_effective_at: null,
    updated_at: new Date().toISOString(),
  }).eq('org_id', orgId)
}

function isPendingDowngradeActive(
  existing: Record<string, unknown> | null | undefined,
  incomingPlanId: string,
): boolean {
  if (!existing?.pending_plan_id || !existing.pending_plan_effective_at) return false
  const effective = new Date(existing.pending_plan_effective_at as string)
  if (Number.isNaN(effective.getTime()) || effective <= new Date()) return false
  const current = normalizePlanId(existing.plan_id as string | undefined)
  return planRank(incomingPlanId) < planRank(current)
}

export async function grantOrgPlan(
  admin: Admin,
  input: {
    orgId: string
    planId: string
    customerId: string | null
    subscriptionId: string | null
    email: string | null
  },
): Promise<void> {
  await applyPendingPlanIfDue(admin, input.orgId)

  const now = new Date().toISOString()
  const planId = normalizePlanId(input.planId)
  const { data: existing } = await admin
    .from('org_plans')
    .select(ORG_PLAN_SELECT)
    .eq('org_id', input.orgId)
    .maybeSingle()

  if (isPendingDowngradeActive(existing, planId)) {
    await admin.from('org_plans').update({
      creem_customer_id: input.customerId,
      creem_subscription_id: input.subscriptionId,
      creem_subscription_status: 'active',
      billing_status: 'active',
      updated_at: now,
    }).eq('org_id', input.orgId)
    await linkBillingOrg(admin, input.orgId, input.email)
    return
  }

  const row: Record<string, unknown> = {
    org_id: input.orgId,
    plan_id: planId,
    pending_plan_id: null,
    pending_plan_effective_at: null,
    creem_customer_id: input.customerId,
    creem_subscription_id: input.subscriptionId,
    creem_subscription_status: 'active',
    billing_status: 'active',
    updated_at: now,
  }

  const planChanged = !existing || existing.plan_id !== planId
  if (planChanged || !existing?.billing_cycle_anchor) {
    row.billing_cycle_anchor = now
  }

  await admin.from('org_plans').upsert(row, { onConflict: 'org_id' })
  await linkBillingOrg(admin, input.orgId, input.email)
}

export async function revokeOrgPlan(admin: Admin, orgId: string): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('org_plans').upsert({
    org_id: orgId,
    plan_id: 'observer',
    pending_plan_id: null,
    pending_plan_effective_at: null,
    creem_subscription_id: null,
    creem_customer_id: null,
    creem_subscription_status: 'canceled',
    billing_status: 'canceled',
    updated_at: now,
  }, { onConflict: 'org_id' })
}

export async function markPaymentFailed(admin: Admin, orgId: string): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('org_plans').upsert({
    org_id: orgId,
    creem_subscription_status: 'past_due',
    billing_status: 'payment_failed',
    updated_at: now,
  }, { onConflict: 'org_id' })
}

export async function markScheduledCancel(admin: Admin, orgId: string): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('org_plans').update({
    creem_subscription_status: 'scheduled_cancel',
    billing_status: 'active',
    pending_plan_id: null,
    pending_plan_effective_at: null,
    updated_at: now,
  }).eq('org_id', orgId)
}

export async function readOrgPlan(admin: Admin, orgId: string) {
  const { data } = await admin
    .from('org_plans')
    .select(ORG_PLAN_SELECT)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}
