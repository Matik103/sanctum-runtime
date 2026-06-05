/** Shared Creem env helpers for Supabase Edge Functions. Set via `supabase secrets set`. */

export function normalizeCreemApiKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^["']|["']$/g, '')
}

export type CreemKeyMode = 'test' | 'live'

export function creemKeyMode(apiKey: string): CreemKeyMode {
  return apiKey.startsWith('creem_test_') ? 'test' : 'live'
}

export function creemApiBase(): string {
  const apiKey = normalizeCreemApiKey(Deno.env.get('CREEM_API_KEY'))
  const explicit = Deno.env.get('CREEM_API_BASE_URL')?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (apiKey.startsWith('creem_test_') || Deno.env.get('CREEM_TEST_MODE') === 'true') {
    return 'https://test-api.creem.io'
  }
  return 'https://api.creem.io'
}

/** Returns a user-facing hint when key/base URL modes disagree or key format looks wrong. */
export function validateCreemEnvironment(apiKey: string): string | null {
  if (!apiKey) return 'CREEM_API_KEY is not set in Supabase Edge Function secrets.'
  if (!apiKey.startsWith('creem_')) {
    return 'CREEM_API_KEY does not look valid (expected creem_* or creem_test_*). Re-copy from Creem Dashboard → Developers.'
  }

  const base = creemApiBase()
  const baseIsTest = base.includes('test-api')
  const mode = creemKeyMode(apiKey)

  if (mode === 'test' && !baseIsTest) {
    return 'CREEM_API_KEY is a test key (creem_test_*) but CREEM_API_BASE_URL points to production. Set CREEM_API_BASE_URL=https://test-api.creem.io or switch to a live API key and live product IDs.'
  }
  if (mode === 'live' && baseIsTest) {
    return 'CREEM_API_KEY is a live key but CREEM_API_BASE_URL points to test-api. Remove CREEM_API_BASE_URL or set https://api.creem.io, and use product IDs from Creem production mode.'
  }
  return null
}

export function creemApiErrorHint(
  httpStatus: number,
  creemError: string | undefined,
  planId: string,
): string {
  const base = creemApiBase()
  const mode = creemKeyMode(normalizeCreemApiKey(Deno.env.get('CREEM_API_KEY')))
  const secretName = `CREEM_PRODUCT_${planId.toUpperCase()}`

  if (httpStatus === 401 || httpStatus === 403 || creemError === 'unauthorized') {
    return `Creem rejected the API key (${mode} key → ${base}). In Supabase secrets, use matching test OR live values for CREEM_API_KEY, CREEM_API_BASE_URL, and ${secretName}. Test and live product IDs are not interchangeable.`
  }
  if (httpStatus === 404) {
    return `${secretName} may be from the wrong Creem environment. Copy the Operator product ID from the same mode (test/live) as your API key.`
  }
  return `Creem API returned HTTP ${httpStatus}. Check CREEM_API_KEY and ${secretName} in Supabase secrets (docs/CREEM_SUPABASE.md).`
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
