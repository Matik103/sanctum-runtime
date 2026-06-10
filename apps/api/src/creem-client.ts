import type { PlanId } from './entitlements.js'

export type CreemConfig = {
  apiKey: string
  baseUrl: string
  testMode: boolean
}

export type PaidPlanId = Exclude<PlanId, 'observer' | 'enterprise'>

export function getCreemConfig(): CreemConfig | null {
  const apiKey = process.env.CREEM_API_KEY?.trim()
  if (!apiKey) return null

  const explicit = process.env.CREEM_API_BASE_URL?.trim()
  const testByKey = apiKey.startsWith('creem_test_')
  const baseUrl =
    explicit
    || (testByKey || process.env.CREEM_TEST_MODE === 'true'
      ? 'https://test-api.creem.io'
      : 'https://api.creem.io')

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    testMode: baseUrl.includes('test-api'),
  }
}

export function creemProductIdForPlan(planId: PaidPlanId): string | null {
  const map: Record<PaidPlanId, string | undefined> = {
    personal: process.env.CREEM_PRODUCT_PERSONAL,
    operator: process.env.CREEM_PRODUCT_OPERATOR,
    team: process.env.CREEM_PRODUCT_TEAM,
  }
  return map[planId]?.trim() || null
}

/** Hosted payment page when Checkout API is unavailable (test: creem.io/test/payment/...). */
export function creemHostedPaymentUrl(productId: string): string {
  const test =
    process.env.CREEM_TEST_MODE === 'true'
    || process.env.CREEM_API_BASE_URL?.includes('test-api')
    || process.env.CREEM_API_KEY?.startsWith('creem_test_')
    || process.env.CREEM_PRODUCT_PERSONAL?.startsWith('prod_')
  const base =
    process.env.CREEM_PAYMENT_BASE_URL?.trim()
    || (test ? 'https://www.creem.io/test/payment' : 'https://www.creem.io/payment')
  return `${base.replace(/\/$/, '')}/${productId}`
}

export function creemProductsConfigured(): Record<PaidPlanId, boolean> {
  return {
    personal: !!creemProductIdForPlan('personal'),
    operator: !!creemProductIdForPlan('operator'),
    team: !!creemProductIdForPlan('team'),
  }
}

export type CreemCheckoutSession = {
  checkoutUrl: string
  checkoutId?: string
  mode: 'api' | 'link'
}

/** POST /v1/checkouts — https://docs.creem.io/features/checkout/checkout-api */
export async function creemCreateCheckoutSession(input: {
  productId: string
  orgId: string
  planId: PaidPlanId
  successUrl: string
  customerEmail?: string
}): Promise<CreemCheckoutSession> {
  const cfg = getCreemConfig()
  if (!cfg) throw new Error('creem_not_configured')

  const metadata = {
    org_id: input.orgId,
    orgId: input.orgId,
    plan: input.planId,
    plan_id: input.planId,
    referenceId: input.orgId,
  }

  const body: Record<string, unknown> = {
    product_id: input.productId,
    request_id: input.orgId,
    metadata,
    success_url: input.successUrl,
  }
  // Creem's checkout API rejects unknown properties — cancel_url is not
  // supported ("property cancel_url should not exist"). Cancel behavior is
  // configured on the Creem product itself.
  if (input.customerEmail) {
    body.customer = { email: input.customerEmail }
  }

  const res = await fetch(`${cfg.baseUrl}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`creem_checkout_http_${res.status}: ${text.slice(0, 500)}`)
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('creem_checkout_invalid_json')
  }

  const checkoutUrl =
    (typeof data.checkout_url === 'string' && data.checkout_url)
    || (typeof data.checkoutUrl === 'string' && data.checkoutUrl)
    || null

  if (!checkoutUrl) throw new Error('creem_checkout_missing_url')

  return {
    checkoutUrl,
    checkoutId: typeof data.id === 'string' ? data.id : undefined,
    mode: 'api',
  }
}

/** GET /v1/checkouts/:id — reconcile plan after redirect if webhook was delayed. */
export async function creemGetCheckout(checkoutId: string): Promise<Record<string, unknown> | null> {
  const cfg = getCreemConfig()
  if (!cfg) return null
  const id = checkoutId.trim()
  if (!id) return null

  const res = await fetch(`${cfg.baseUrl}/v1/checkouts/${encodeURIComponent(id)}`, {
    headers: { 'x-api-key': cfg.apiKey },
  })
  if (!res.ok) return null
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export function defaultBillingReturnUrls(
  dashboardBase: string,
  opts?: { checkoutId?: string },
): { successUrl: string; cancelUrl: string } {
  const base = dashboardBase.replace(/\/$/, '')
  const success = new URL(`${base}/`)
  success.searchParams.set('page', 'billing')
  success.searchParams.set('checkout', 'success')
  if (opts?.checkoutId) success.searchParams.set('checkout_id', opts.checkoutId)
  const cancel = new URL(`${base}/`)
  cancel.searchParams.set('page', 'billing')
  cancel.searchParams.set('checkout', 'cancelled')
  return {
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
  }
}

export function creemPublicConfig(): {
  configured: boolean
  testMode: boolean
  apiBaseUrl: string | null
  webhookConfigured: boolean
  checkoutApi: boolean
  products: Record<PaidPlanId, boolean>
  staticCheckoutLinks: Record<PaidPlanId | 'enterprise', boolean>
} {
  const cfg = getCreemConfig()
  const products = creemProductsConfigured()
  return {
    configured: !!cfg,
    testMode: cfg?.testMode ?? false,
    apiBaseUrl: cfg?.baseUrl ?? null,
    webhookConfigured: !!process.env.CREEM_WEBHOOK_SECRET?.trim(),
    checkoutApi: !!cfg && Object.values(products).some(Boolean),
    products,
    staticCheckoutLinks: {
      personal: !!process.env.CREEM_CHECKOUT_PERSONAL_URL?.trim(),
      operator: !!process.env.CREEM_CHECKOUT_OPERATOR_URL?.trim(),
      team: !!process.env.CREEM_CHECKOUT_TEAM_URL?.trim(),
      enterprise: !!process.env.CREEM_CHECKOUT_ENTERPRISE_URL?.trim(),
    },
  }
}
