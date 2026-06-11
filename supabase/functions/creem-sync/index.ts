/**
 * Post-checkout reconcile — fetch Creem checkout by id when webhook is delayed.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  creemApiBase,
  normalizeCreemApiKey,
  productMap,
  validateCreemEnvironment,
} from '../_shared/creem.ts'
import { grantOrgPlan, readOrgPlan } from '../_shared/creem-org-plan.ts'
import { creemGetSubscription, planIdFromSubscription } from '../_shared/creem-subscription.ts'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'
import {
  customerEmail,
  customerId,
  orgIdFrom,
  planFrom,
  subscriptionId,
} from '../_shared/creem-parse.ts'

const BILLING_ROLES = new Set(['owner', 'admin'])

async function syncFromCreemSubscription(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  apiKey: string,
  email: string | null,
): Promise<{ planId: string } | null> {
  const row = await readOrgPlan(admin, orgId)
  const subId = (row?.creem_subscription_id as string | undefined)?.trim()
  if (!subId) return null

  const fetched = await creemGetSubscription(apiKey, subId)
  if (!fetched.ok) return null
  const sub = fetched.body

  const map = productMap()
  const planId = planIdFromSubscription(sub, map) ?? planFrom(sub, map)
  if (!planId) return null

  await grantOrgPlan(admin, {
    orgId,
    planId,
    customerId: customerId(sub) ?? (row?.creem_customer_id as string | null) ?? null,
    subscriptionId: subscriptionId(sub) ?? subId,
    email,
  })
  return { planId }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonWithCors(req, { error: 'method_not_allowed' }, { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonWithCors(req, { error: 'unauthorized' }, { status: 401 })
  }

  let body: { org_id?: string; checkout_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonWithCors(req, { error: 'invalid_json' }, { status: 400 })
  }

  const orgId = body.org_id?.trim()
  if (!orgId) {
    return jsonWithCors(req, { error: 'org_id_required' }, { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return jsonWithCors(req, { error: 'unauthorized' }, { status: 401 })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member?.role || !BILLING_ROLES.has(member.role)) {
    return jsonWithCors(req, {
      error: 'org_forbidden',
      hint: 'Only workspace owners or admins can sync billing.',
    }, { status: 403 })
  }

  const checkoutId = body.checkout_id?.trim()
  const apiKey = normalizeCreemApiKey(Deno.env.get('CREEM_API_KEY'))

  if (checkoutId && apiKey) {
    const envError = validateCreemEnvironment(apiKey)
    if (!envError) {
      const res = await fetch(`${creemApiBase()}/v1/checkouts/${encodeURIComponent(checkoutId)}`, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(12_000),
      })
      if (res.ok) {
        const checkout = await res.json() as Record<string, unknown>
        const status = String(checkout.status ?? '').toLowerCase()
        const paid = status === 'completed' || status === 'paid'
        if (paid) {
          const map = productMap()
          const planId = planFrom(checkout, map)
          const resolvedOrg = orgIdFrom(checkout) ?? orgId
          if (planId && resolvedOrg === orgId) {
            await grantOrgPlan(admin, {
              orgId,
              planId,
              customerId: customerId(checkout),
              subscriptionId: subscriptionId(checkout),
              email: customerEmail(checkout) ?? user.email ?? null,
            })
            return jsonWithCors(req, {
              ok: true,
              synced: true,
              orgId,
              planId,
              source: 'creem_checkout',
            })
          }
        }
      }
    }
  }

  if (apiKey) {
    const envError = validateCreemEnvironment(apiKey)
    if (!envError) {
      const fromSub = await syncFromCreemSubscription(
        admin,
        orgId,
        apiKey,
        user.email ?? null,
      )
      if (fromSub) {
        return jsonWithCors(req, {
          ok: true,
          synced: true,
          orgId,
          planId: fromSub.planId,
          source: 'creem_subscription',
        })
      }
    }
  }

  const row = await readOrgPlan(admin, orgId)
  return jsonWithCors(req, {
    ok: true,
    synced: false,
    orgId,
    planId: row?.plan_id ?? 'observer',
    creemSubscriptionId: row?.creem_subscription_id ?? null,
    creemSubscriptionStatus: row?.creem_subscription_status ?? null,
    billingStatus: row?.billing_status ?? null,
    note: checkoutId
      ? 'Webhook may still be processing; refresh again in a few seconds.'
      : 'Could not reconcile from Creem subscription; returned current org_plans row.',
  })
})
