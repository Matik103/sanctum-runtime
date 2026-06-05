/** Shared Creem env helpers for Supabase Edge Functions. Set via `supabase secrets set`. */

export function creemApiBase(): string {
  const apiKey = Deno.env.get('CREEM_API_KEY')?.trim() ?? ''
  const explicit = Deno.env.get('CREEM_API_BASE_URL')?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (apiKey.startsWith('creem_test_') || Deno.env.get('CREEM_TEST_MODE') === 'true') {
    return 'https://test-api.creem.io'
  }
  return 'https://api.creem.io'
}

export function productMap(): Record<string, string> {
  const map: Record<string, string> = {}
  const pairs: [string | undefined, string][] = [
    [Deno.env.get('CREEM_PRODUCT_PERSONAL'), 'personal'],
    [Deno.env.get('CREEM_PRODUCT_OPERATOR'), 'operator'],
    [Deno.env.get('CREEM_PRODUCT_TEAM'), 'team'],
    [Deno.env.get('CREEM_PRODUCT_ENTERPRISE'), 'enterprise'],
  ]
  for (const [id, plan] of pairs) {
    if (id?.trim()) map[id.trim()] = plan
  }
  return map
}

export function productIdForPlan(planId: string): string | null {
  const key = `CREEM_PRODUCT_${planId.toUpperCase()}`
  return Deno.env.get(key)?.trim() || null
}

export function dashboardBillingSuccessUrl(orgId: string): string {
  const base = (Deno.env.get('DASHBOARD_URL') ?? 'https://console.sanctumruntime.com').replace(/\/$/, '')
  const u = new URL(`${base}/`)
  u.searchParams.set('page', 'billing')
  u.searchParams.set('checkout', 'success')
  u.searchParams.set('org_id', orgId)
  return u.toString()
}

export function dashboardBillingCancelUrl(): string {
  const base = (Deno.env.get('DASHBOARD_URL') ?? 'https://console.sanctumruntime.com').replace(/\/$/, '')
  const u = new URL(`${base}/`)
  u.searchParams.set('page', 'billing')
  u.searchParams.set('checkout', 'cancelled')
  return u.toString()
}
