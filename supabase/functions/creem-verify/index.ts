/**
 * Admin-only Creem billing diagnostics (uses Edge Function secrets).
 * Invoke with service role JWT: npm run creem:verify-remote
 */
import {
  creemApiBase,
  creemKeyMode,
  formatCreemErrorDetail,
  normalizeCreemApiKey,
  productIdForPlan,
  validateCreemEnvironment,
} from '../_shared/creem.ts'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'

const PLANS = ['personal', 'operator', 'team'] as const

function mask(value: string | null | undefined, show = 8): string | null {
  if (!value?.trim()) return null
  const v = value.trim()
  if (v.length <= show + 4) return `${v.slice(0, 4)}…`
  return `${v.slice(0, show)}…${v.slice(-4)}`
}

function jwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization')?.trim() ?? ''
  if (!auth.startsWith('Bearer ') || jwtRole(auth) !== 'service_role') {
    return jsonWithCors(req, {
      error: 'forbidden',
      hint: 'Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY JWT>',
    }, { status: 403 })
  }
  return null
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const denied = requireServiceRole(req)
  if (denied) return denied

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonWithCors(req, { error: 'method_not_allowed' }, { status: 405 })
  }

  const apiKey = normalizeCreemApiKey(Deno.env.get('CREEM_API_KEY'))
  const base = creemApiBase()
  const envError = validateCreemEnvironment(apiKey)
  const dashboardUrl = Deno.env.get('DASHBOARD_URL')?.trim() ?? null
  const webhookSecretSet = Boolean(Deno.env.get('CREEM_WEBHOOK_SECRET')?.trim())

  const secrets: Record<string, string | null> = {
    CREEM_API_KEY: mask(apiKey, 12),
    CREEM_API_BASE_URL: Deno.env.get('CREEM_API_BASE_URL')?.trim() || '(auto)',
    CREEM_WEBHOOK_SECRET: webhookSecretSet ? '(set)' : null,
    DASHBOARD_URL: dashboardUrl,
    CREEM_PRODUCT_PERSONAL: mask(productIdForPlan('personal')),
    CREEM_PRODUCT_OPERATOR: mask(productIdForPlan('operator')),
    CREEM_PRODUCT_TEAM: mask(productIdForPlan('team')),
    CREEM_PRODUCT_ENTERPRISE: mask(productIdForPlan('enterprise')),
  }

  const productTests: Record<string, { ok: boolean; status: number; detail: string | null; checkoutId?: string }> = {}

  if (!envError && apiKey) {
    for (const planId of PLANS) {
      const productId = productIdForPlan(planId)
      if (!productId) {
        productTests[planId] = { ok: false, status: 0, detail: `Missing secret CREEM_PRODUCT_${planId.toUpperCase()}` }
        continue
      }

      const res = await fetch(`${base}/v1/checkouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          product_id: productId,
          request_id: `verify-${planId}-${Date.now()}`,
          success_url: `${(dashboardUrl ?? 'https://console.sanctumruntime.com').replace(/\/$/, '')}/?page=billing&checkout=success`,
          metadata: { org_id: 'creem-verify', plan_id: planId },
        }),
        signal: AbortSignal.timeout(15_000),
      })

      const text = await res.text()
      if (res.ok) {
        let checkoutId: string | undefined
        try {
          const data = JSON.parse(text) as { id?: string }
          checkoutId = data.id
        } catch { /* ignore */ }
        productTests[planId] = { ok: true, status: res.status, detail: null, checkoutId }
      } else {
        productTests[planId] = {
          ok: false,
          status: res.status,
          detail: formatCreemErrorDetail(text) || text.slice(0, 200),
        }
      }
    }
  }

  const webhookTest = await testWebhookHandler(webhookSecretSet)

  const allProductsOk = Object.values(productTests).every((t) => t.ok)
  const ok = !envError && webhookSecretSet && Boolean(dashboardUrl) && allProductsOk && webhookTest.ok

  const fixes = buildFixes(envError, webhookSecretSet, dashboardUrl, productTests, apiKey, base)
  if (!webhookTest.ok && webhookTest.detail) fixes.push(webhookTest.detail)

  return jsonWithCors(req, {
    ok,
    mode: apiKey ? creemKeyMode(apiKey) : null,
    creemApiBase: base,
    envError,
    secrets,
    productTests,
    webhookTest,
    creemWebhookUrl: `${Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')}/functions/v1/creem-webhook`,
    fixes,
  })
})

async function testWebhookHandler(webhookSecretSet: boolean): Promise<{
  ok: boolean
  status: number
  detail: string | null
}> {
  if (!webhookSecretSet) {
    return { ok: false, status: 0, detail: 'CREEM_WEBHOOK_SECRET not set' }
  }

  const secret = Deno.env.get('CREEM_WEBHOOK_SECRET')!.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')
  if (!supabaseUrl) return { ok: false, status: 0, detail: 'SUPABASE_URL missing in function env' }

  const payload = JSON.stringify({
    id: `evt_verify_${Date.now()}`,
    eventType: 'subscription.update',
    object: { id: 'sub_verify', object: 'subscription' },
  })

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const res = await fetch(`${supabaseUrl}/functions/v1/creem-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'creem-signature': signature },
    body: payload,
    signal: AbortSignal.timeout(12_000),
  })

  const text = await res.text()
  if (res.ok) return { ok: true, status: res.status, detail: null }
  return {
    ok: false,
    status: res.status,
    detail: `creem-webhook rejected self-test: HTTP ${res.status} ${text.slice(0, 120)}`,
  }
}

function buildFixes(
  envError: string | null,
  webhookSecretSet: boolean,
  dashboardUrl: string | null,
  productTests: Record<string, { ok: boolean; status: number; detail: string | null }>,
  apiKey: string,
  base: string,
): string[] {
  const fixes: string[] = []
  if (envError) fixes.push(envError)
  if (!webhookSecretSet) fixes.push('Set CREEM_WEBHOOK_SECRET from Creem Dashboard → Developers → Webhooks.')
  if (!dashboardUrl) fixes.push('Set DASHBOARD_URL=https://console.sanctumruntime.com')
  if (!apiKey) fixes.push('Set CREEM_API_KEY from Creem Dashboard → Developers (test mode: creem_test_*).')

  for (const [plan, t] of Object.entries(productTests)) {
    if (t.ok) continue
    if (t.status === 404) {
      fixes.push(
        `CREEM_PRODUCT_${plan.toUpperCase()}: product not found on ${base}. Copy product ID from Creem with the same test/live mode as your API key.`,
      )
    } else if (t.status === 401 || t.status === 403) {
      fixes.push('CREEM_API_KEY rejected by Creem — re-copy from Developers → API Keys (match test/live mode).')
      break
    } else if (t.detail) {
      fixes.push(`${plan}: ${t.detail}`)
    }
  }

  const mode = apiKey ? creemKeyMode(apiKey) : null
  if (mode === 'test' && !base.includes('test-api')) {
    fixes.push('Run: supabase secrets set CREEM_API_BASE_URL=https://test-api.creem.io')
  }
  if (mode === 'live' && base.includes('test-api')) {
    fixes.push('Run: supabase secrets unset CREEM_API_BASE_URL')
  }

  return [...new Set(fixes)]
}
