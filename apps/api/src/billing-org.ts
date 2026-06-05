import type { SupabaseClient } from '@supabase/supabase-js'
import type { ControlPlaneStore } from './control-plane-store.js'
import type { PlanId } from './entitlements.js'

const PLAN_RANK: Record<string, number> = {
  observer: 0,
  free: 0,
  personal: 1,
  operator: 2,
  team: 3,
  enterprise: 4,
}

function planRank(planId: string): number {
  return PLAN_RANK[planId] ?? 0
}

/** Workspace that owns billing for this user (explicit org > profile link > paid org > personal). */
export async function resolveBillingOrgId(
  store: ControlPlaneStore,
  admin: SupabaseClient,
  userId: string,
  explicitOrgId?: string | null,
): Promise<string | null> {
  const orgs = await store.getUserOrgIds(userId)
  if (!orgs.length) return null
  if (explicitOrgId && orgs.includes(explicitOrgId)) return explicitOrgId

  const { data: profile } = await admin
    .from('profiles')
    .select('billing_org_id')
    .eq('id', userId)
    .maybeSingle()

  const linked = profile?.billing_org_id as string | undefined
  if (linked && orgs.includes(linked)) return linked

  const { data: plans } = await admin
    .from('org_plans')
    .select('org_id, plan_id, creem_subscription_id, creem_customer_id')
    .in('org_id', orgs)

  if (plans?.length) {
    const paid = [...plans].sort((a, b) => planRank(b.plan_id as string) - planRank(a.plan_id as string))
    const withCreem = paid.find((p) => p.creem_subscription_id || p.creem_customer_id)
    const bestPaid = paid.find((p) => planRank(p.plan_id as string) > planRank('observer'))
    if (withCreem?.org_id) return withCreem.org_id as string
    if (bestPaid?.org_id) return bestPaid.org_id as string
  }

  const personal = orgs.find((o) => o.startsWith('personal-'))
  return personal ?? orgs[0] ?? null
}

export async function setProfileBillingOrg(
  admin: SupabaseClient,
  orgId: string,
  opts?: { userId?: string; customerEmail?: string | null },
): Promise<void> {
  const userIds = new Set<string>()
  if (opts?.userId) userIds.add(opts.userId)

  if (opts?.customerEmail) {
    const email = opts.customerEmail.trim().toLowerCase()
    const { data: profile } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (profile?.id) userIds.add(profile.id as string)
  }

  const { data: owners } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])

  for (const row of owners ?? []) {
    if (row.user_id) userIds.add(row.user_id as string)
  }

  const now = new Date().toISOString()
  for (const id of userIds) {
    await admin.from('profiles').update({ billing_org_id: orgId, updated_at: now }).eq('id', id)
  }
}

export type ProfileBillingStatus = {
  billing_org_id: string | null
  plan_id: PlanId
  plan_name: string
  price_monthly_usd: number | null
  creem_subscription_id: string | null
  creem_subscription_status: string | null
  billing_status: string | null
}

export async function loadProfileBillingStatus(
  admin: SupabaseClient,
  store: ControlPlaneStore,
  userId: string,
): Promise<ProfileBillingStatus | null> {
  const orgId = await resolveBillingOrgId(store, admin, userId)
  if (!orgId) return null

  const { data: row } = await admin
    .from('org_plans')
    .select('plan_id, creem_subscription_id, creem_subscription_status, billing_status')
    .eq('org_id', orgId)
    .maybeSingle()

  const planId = (row?.plan_id as PlanId) ?? 'observer'
  const { PLAN_DEFAULTS } = await import('./entitlements.js')
  const defaults = PLAN_DEFAULTS[planId] ?? PLAN_DEFAULTS.observer

  return {
    billing_org_id: orgId,
    plan_id: planId,
    plan_name: defaults.planName,
    price_monthly_usd: defaults.priceMonthlyUsd,
    creem_subscription_id: (row?.creem_subscription_id as string | null) ?? null,
    creem_subscription_status: (row?.creem_subscription_status as string | null) ?? null,
    billing_status: (row?.billing_status as string | null) ?? 'active',
  }
}
