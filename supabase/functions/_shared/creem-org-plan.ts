/**
 * Shared org_plans updates for Creem Edge Functions (webhook + sync).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Admin = SupabaseClient

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
  const now = new Date().toISOString()
  const { data: existing } = await admin
    .from('org_plans')
    .select('plan_id, billing_cycle_anchor')
    .eq('org_id', input.orgId)
    .maybeSingle()

  const row: Record<string, unknown> = {
    org_id: input.orgId,
    plan_id: input.planId,
    creem_customer_id: input.customerId,
    creem_subscription_id: input.subscriptionId,
    creem_subscription_status: 'active',
    billing_status: 'active',
    updated_at: now,
  }

  const planChanged = !existing || existing.plan_id !== input.planId
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
    updated_at: now,
  }).eq('org_id', orgId)
}

export async function readOrgPlan(admin: Admin, orgId: string) {
  const { data } = await admin
    .from('org_plans')
    .select('plan_id, creem_subscription_id, creem_subscription_status, billing_status')
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}
