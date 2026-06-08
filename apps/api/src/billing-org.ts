import type { SupabaseClient } from '@supabase/supabase-js'
import type { ControlPlaneStore } from './control-plane-store.js'
import { normalizePlanId, type PlanId } from './entitlements.js'

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

/** Idempotent: every workspace needs org_plans (Developer / observer) for billing UI + Creem. */
export async function ensureOrgPlanRow(admin: SupabaseClient, orgId: string): Promise<void> {
  const { data } = await admin
    .from('org_plans')
    .select('org_id')
    .eq('org_id', orgId)
    .maybeSingle()
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

type MemberRow = { org_id: string; role: string }

async function loadMemberships(admin: SupabaseClient, userId: string): Promise<MemberRow[]> {
  const { data } = await admin
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', userId)
  return (data ?? []) as MemberRow[]
}

/** Enterprise SSO and org-signup owners must not get a shadow personal workspace. */
export async function shouldProvisionPersonalWorkspace(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from('profiles')
    .select('portal_type')
    .eq('id', userId)
    .maybeSingle()
  if (profile?.portal_type === 'enterprise') return false

  const members = await loadMemberships(admin, userId)
  return !members.some(
    (m) => (m.role === 'owner' || m.role === 'admin') && !m.org_id.startsWith('personal-'),
  )
}

/** Personal workspace + owner membership + Developer plan row (individual operator accounts). */
export async function ensurePersonalWorkspaceForUser(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string> {
  const personalOrgId = `personal-${user.id.replace(/-/g, '').slice(0, 12)}`
  const label = user.email?.split('@')[0]?.trim() || 'Workspace'
  await admin.from('organizations').upsert(
    {
      id: personalOrgId,
      name: `${label}'s workspace`,
      signup_source: 'dashboard',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  await admin.from('organization_members').upsert(
    { org_id: personalOrgId, user_id: user.id, role: 'owner' },
    { onConflict: 'org_id,user_id', ignoreDuplicates: true },
  )
  await ensureOrgPlanRow(admin, personalOrgId)
  return personalOrgId
}

/**
 * Idempotent workspace bootstrap for authenticated users.
 * - Ensures org_plans on every membership
 * - Personal workspace only for individual operator accounts
 */
export async function ensureWorkspaceForUser(
  admin: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string | null> {
  const members = await loadMemberships(admin, user.id)
  for (const m of members) {
    await ensureOrgPlanRow(admin, m.org_id)
  }

  const ownedBusiness = members.find(
    (m) => (m.role === 'owner' || m.role === 'admin') && !m.org_id.startsWith('personal-'),
  )
  if (ownedBusiness) return ownedBusiness.org_id

  if (!(await shouldProvisionPersonalWorkspace(admin, user.id))) {
    return members[0]?.org_id ?? null
  }

  if (members.some((m) => m.org_id.startsWith('personal-'))) {
    return members.find((m) => m.org_id.startsWith('personal-'))!.org_id
  }

  return ensurePersonalWorkspaceForUser(admin, user)
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

  const { data: memberships } = await admin
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', userId)

  const ownedBusiness = (memberships ?? []).find(
    (m) =>
      (m.role === 'owner' || m.role === 'admin')
      && orgs.includes(m.org_id as string)
      && !String(m.org_id).startsWith('personal-'),
  )
  if (ownedBusiness?.org_id) return ownedBusiness.org_id as string

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

  await ensureOrgPlanRow(admin, orgId)

  const { data: row } = await admin
    .from('org_plans')
    .select('plan_id, creem_subscription_id, creem_subscription_status, billing_status')
    .eq('org_id', orgId)
    .maybeSingle()

  const planId = normalizePlanId(row?.plan_id as string | undefined)
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
