/**
 * Authenticated Creem checkout — uses CREEM_API_KEY + CREEM_PRODUCT_* from Supabase secrets.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import {
  creemApiBase,
  creemApiErrorHint,
  dashboardBillingCancelUrl,
  dashboardBillingSuccessUrl,
  normalizeCreemApiKey,
  productIdForPlan,
  validateCreemEnvironment,
} from '../_shared/creem.ts'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'

const PAID_PLANS = new Set(['personal', 'operator', 'team'])
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

  let body: { org_id?: string; plan_id?: string; success_url?: string; cancel_url?: string }
  try {
    body = await req.json()
  } catch {
    return jsonWithCors(req, { error: 'invalid_json' }, { status: 400 })
  }

  const orgId = body.org_id?.trim()
  const planId = body.plan_id?.trim()
  if (!orgId || !planId || !PAID_PLANS.has(planId)) {
    return jsonWithCors(req, { error: 'org_id_and_plan_id_required' }, { status: 400 })
  }

  const productId = productIdForPlan(planId)
  if (!productId) {
    return jsonWithCors(req, {
      error: 'product_not_configured',
      hint: `Set CREEM_PRODUCT_${planId.toUpperCase()} in Supabase Edge Function secrets`,
    }, { status: 503 })
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
      hint: 'Only workspace owners or admins can start checkout.',
    }, { status: 403 })
  }

  await admin.from('profiles').update({
    billing_org_id: orgId,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)

  const successUrl = body.success_url ?? dashboardBillingSuccessUrl(orgId)
  const cancelUrl = body.cancel_url ?? dashboardBillingCancelUrl()

  const creemBody = {
    product_id: productId,
    request_id: orgId,
    metadata: {
      org_id: orgId,
      orgId,
      plan: planId,
      plan_id: planId,
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
      hint: creemApiErrorHint(res.status, creemError, planId),
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
    checkoutMode: 'api',
    planId,
    message: null,
  })
})
