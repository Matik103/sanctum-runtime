/**
 * Plan changes: new checkout, subscription upgrade/downgrade, or cancel to
 * the free Developer tier (entitlement id: observer).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import {
  creemApiBase,
  creemApiErrorHint,
  dashboardBillingCancelUrl,
  dashboardBillingSuccessUrl,
  normalizeCreemApiKey,
  productIdForPlan,
  productMap,
  validateCreemEnvironment,
} from '../_shared/creem.ts'
import {
  ensureOrgPlan,
  grantOrgPlan,
  markScheduledCancel,
  normalizePlanId,
  revokeOrgPlan,
} from '../_shared/creem-org-plan.ts'
import {
  creemCancelSubscription,
  creemChangeSubscriptionPlan,
  hasActiveCreemSubscription,
  planChangeType,
  planIdFromSubscription,
} from '../_shared/creem-subscription.ts'
import { customerEmail, customerId, subscriptionId } from '../_shared/creem-parse.ts'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'

const CHANGEABLE_PLANS = new Set(['observer', 'personal', 'operator', 'team'])
const BILLING_ROLES = new Set(['owner', 'admin'])

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonWithCors(req, { error: 'method_not_allowed' }, { status: 405 })
  }

  const apiKey = normalizeCreemApiKey(Deno.env.get('CREEM_API_KEY'))
  if (!apiKey) {
    return jsonWithCors(req, { error: 'creem_api_key_not_configured' }, { status: 503 })
  }

  const envError = validateCreemEnvironment(apiKey)
  if (envError) {
    return jsonWithCors(req, {
      error: 'creem_env_mismatch',
      hint: envError,
      creemApiBase: creemApiBase(),
    }, { status: 503 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonWithCors(req, { error: 'unauthorized' }, { status: 401 })
  }

  let body: {
    org_id?: string
    plan_id?: string
    success_url?: string
    cancel_url?: string
    cancel_mode?: 'scheduled' | 'immediate'
  }
  try {
    body = await req.json()
  } catch {
    return jsonWithCors(req, { error: 'invalid_json' }, { status: 400 })
  }

  const orgId = body.org_id?.trim()
  const planId = body.plan_id?.trim()
  if (!orgId || !planId || !CHANGEABLE_PLANS.has(planId)) {
    return jsonWithCors(req, { error: 'org_id_and_plan_id_required' }, { status: 400 })
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
      hint: 'Only workspace owners or admins can change billing.',
    }, { status: 403 })
  }

  await admin.from('profiles').update({
    billing_org_id: orgId,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)

  await ensureOrgPlan(admin, orgId)

  const { data: orgPlan } = await admin
    .from('org_plans')
    .select('plan_id, creem_subscription_id, creem_subscription_status, creem_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()

  const currentPlanId = normalizePlanId(orgPlan?.plan_id as string | undefined)
  const targetPlanId = normalizePlanId(planId)
  const subId = orgPlan?.creem_subscription_id as string | undefined
  const subStatus = orgPlan?.creem_subscription_status as string | undefined

  if (currentPlanId === targetPlanId) {
    const label = targetPlanId === 'observer' ? 'Developer' : targetPlanId
    return jsonWithCors(req, {
      checkoutUrl: null,
      changed: false,
      planId: targetPlanId,
      message: `This workspace is already on the ${label} plan.`,
    })
  }

  // ─── Cancel → Developer (scheduled by default per Creem best practice) ───────
  if (targetPlanId === 'observer') {
    if (!hasActiveCreemSubscription(currentPlanId, subId, subStatus)) {
      return jsonWithCors(req, {
        checkoutUrl: null,
        changed: false,
        planId: 'observer',
        message: 'This workspace is already on the Developer plan.',
      })
    }

    const cancelMode = body.cancel_mode === 'immediate' ? 'immediate' : 'scheduled'
    const canceled = await creemCancelSubscription(apiKey, subId!, cancelMode)
    if (!canceled.ok) {
      return jsonWithCors(req, {
        error: 'creem_cancel_failed',
        hint: creemApiErrorHint(canceled.status, undefined, 'observer', canceled.text),
        detail: canceled.text.slice(0, 300),
      }, { status: 502 })
    }

    if (cancelMode === 'immediate') {
      await revokeOrgPlan(admin, orgId)
      return jsonWithCors(req, {
        checkoutUrl: null,
        changed: true,
        changeType: 'cancel_immediate',
        planId: 'observer',
        message: 'Subscription canceled. This workspace is now on the Developer plan.',
      })
    }

    await markScheduledCancel(admin, orgId)
    return jsonWithCors(req, {
      checkoutUrl: null,
      changed: true,
      changeType: 'cancel_scheduled',
      planId: currentPlanId,
      message:
        `Cancellation scheduled. You keep ${currentPlanId} access until the current billing period ends, then move to Developer.`,
    })
  }

  const productId = productIdForPlan(targetPlanId)
  if (!productId) {
    return jsonWithCors(req, {
      error: 'product_not_configured',
      hint: 'Billing checkout is not ready for this plan yet. Contact billing@sanctumruntime.com and we will move the workspace for you.',
    }, { status: 503 })
  }

  // ─── Existing subscriber: upgrade or downgrade via subscription API ─────────
  if (hasActiveCreemSubscription(currentPlanId, subId, subStatus)) {
    const change = await creemChangeSubscriptionPlan(apiKey, subId!, productId)
    if (!change.ok) {
      return jsonWithCors(req, {
        error: 'creem_plan_change_failed',
        hint: creemApiErrorHint(change.status, undefined, targetPlanId, change.text),
        creemApiBase: creemApiBase(),
        detail: change.text.slice(0, 300),
      }, { status: 502 })
    }

    const map = productMap()
    const resolvedPlan = planIdFromSubscription(change.body, map) ?? targetPlanId
    await grantOrgPlan(admin, {
      orgId,
      planId: resolvedPlan,
      customerId: customerId(change.body) ?? (orgPlan?.creem_customer_id as string | null) ?? null,
      subscriptionId: subscriptionId(change.body) ?? subId!,
      email: user.email ?? null,
    })

    const changeType = planChangeType(currentPlanId, resolvedPlan)
    const message = changeType === 'upgrade'
      ? `Plan upgraded to ${resolvedPlan}. Prorated charge applied to your payment method on file.`
      : changeType === 'downgrade'
        ? `Plan downgraded to ${resolvedPlan}. Prorated credit applied per Creem billing rules.`
        : `Plan changed to ${resolvedPlan}.`

    return jsonWithCors(req, {
      checkoutUrl: null,
      changed: true,
      upgraded: true,
      changeType,
      checkoutMode: 'subscription_change',
      planId: resolvedPlan,
      message,
    })
  }

  // ─── New subscription: hosted checkout ────────────────────────────────────
  const successUrl = body.success_url ?? dashboardBillingSuccessUrl(orgId)
  const cancelUrl = body.cancel_url ?? dashboardBillingCancelUrl()

  const creemBody = {
    product_id: productId,
    request_id: orgId,
    metadata: {
      org_id: orgId,
      orgId,
      plan: targetPlanId,
      plan_id: targetPlanId,
      referenceId: orgId,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: user.email ? { email: user.email } : undefined,
  }

  const res = await fetch(`${creemApiBase()}/v1/checkouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(creemBody),
    signal: AbortSignal.timeout(12_000),
  })

  const text = await res.text()
  if (!res.ok) {
    let creemError: string | undefined
    try {
      const parsed = JSON.parse(text) as { error?: string }
      creemError = parsed.error
    } catch {
      /* plain-text body */
    }
    return jsonWithCors(req, {
      error: 'creem_checkout_failed',
      hint: creemApiErrorHint(res.status, creemError, targetPlanId, text),
      creemApiBase: creemApiBase(),
      detail: text.slice(0, 300),
    }, { status: 502 })
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    return jsonWithCors(req, { error: 'creem_invalid_response' }, { status: 502 })
  }

  const checkoutUrl =
    (typeof data.checkout_url === 'string' && data.checkout_url)
    || (typeof data.checkoutUrl === 'string' && data.checkoutUrl)
    || null

  if (!checkoutUrl) return jsonWithCors(req, { error: 'creem_missing_checkout_url' }, { status: 502 })

  return jsonWithCors(req, {
    checkoutUrl,
    checkoutId: typeof data.id === 'string' ? data.id : null,
    billingProvider: 'creem',
    checkoutMode: 'checkout',
    planId: targetPlanId,
    message: null,
  })
})
