/**
 * Creem customer portal — payment methods, invoices, self-service cancel.
 * @see docs/CREEM_BILLING_FLOWS.md
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  creemApiErrorHint,
  normalizeCreemApiKey,
  validateCreemEnvironment,
} from '../_shared/creem.ts'
import { creemCustomerPortalLink } from '../_shared/creem-subscription.ts'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'

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
    return jsonWithCors(req, { error: 'creem_env_mismatch', hint: envError }, { status: 503 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonWithCors(req, { error: 'unauthorized' }, { status: 401 })
  }

  let body: { org_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonWithCors(req, { error: 'invalid_json' }, { status: 400 })
  }

  const orgId = body.org_id?.trim()
  if (!orgId) return jsonWithCors(req, { error: 'org_id_required' }, { status: 400 })

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
    return jsonWithCors(req, { error: 'org_forbidden' }, { status: 403 })
  }

  const { data: orgPlan } = await admin
    .from('org_plans')
    .select('creem_customer_id')
    .eq('org_id', orgId)
    .maybeSingle()

  const customerId = orgPlan?.creem_customer_id as string | undefined
  if (!customerId?.trim()) {
    return jsonWithCors(req, {
      error: 'no_creem_customer',
      hint: 'Complete a paid checkout first, or wait for the Creem webhook to link your customer id.',
    }, { status: 404 })
  }

  const portal = await creemCustomerPortalLink(apiKey, customerId)
  if (!portal.ok || !portal.portalUrl) {
    return jsonWithCors(req, {
      error: 'creem_portal_failed',
      hint: creemApiErrorHint(portal.status, undefined, 'personal', portal.text),
      detail: portal.text?.slice(0, 300),
    }, { status: 502 })
  }

  return jsonWithCors(req, {
    portalUrl: portal.portalUrl,
    message: null,
  })
})
