import { createClient, type User } from '@supabase/supabase-js'
import { allowOpenApi, isProduction } from './security.js'

export type SupabaseAuthConfig = {
  url: string
  serviceRoleKey: string
}

// Hard per-request timeout for every Supabase HTTP call. Enforced at the fetch
// layer so callers that bypass queryWithTimeout() still get protection — a
// slow PostgREST region or saturated connection pool cannot stall an event
// loop indefinitely. Default 8 s sits above Supabase free-tier's ~8s statement
// timeout but well below any client-facing request timeout, so we always fail
// fast with a clear error rather than holding a connection slot.
const SUPABASE_FETCH_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(1000, Number(process.env.SUPABASE_FETCH_TIMEOUT_MS ?? 8000) || 8000),
)

// Counter exposed via /metrics so timeout pressure is visible in Prometheus.
let supabaseFetchTimeoutTotal = 0
export function getSupabaseFetchTimeoutTotal(): number {
  return supabaseFetchTimeoutTotal
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const incoming = init?.signal
  // Honor any caller-supplied abort signal in addition to our timeout.
  if (incoming) {
    if (incoming.aborted) controller.abort(incoming.reason)
    else incoming.addEventListener('abort', () => controller.abort(incoming.reason), { once: true })
  }
  const timer = setTimeout(() => {
    supabaseFetchTimeoutTotal++
    controller.abort(new Error(`supabase fetch timeout after ${SUPABASE_FETCH_TIMEOUT_MS}ms`))
  }, SUPABASE_FETCH_TIMEOUT_MS)
  // unref so a pending timer never holds the event loop open during shutdown.
  if (typeof timer === 'object' && timer && 'unref' in timer) (timer as NodeJS.Timeout).unref()
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export function isSupabaseAuthEnabled(): boolean {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return Boolean(url && key)
}

export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  return { url, serviceRoleKey }
}

export function createSupabaseAdmin(config: SupabaseAuthConfig) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  })
}

export async function verifySupabaseAccessToken(
  config: SupabaseAuthConfig,
  accessToken: string,
): Promise<User | null> {
  const admin = createSupabaseAdmin(config)
  const { data, error } = await admin.auth.getUser(accessToken)
  if (error || !data.user) return null
  return data.user
}

export type AuthResult =
  | { ok: true; method: 'supabase'; user: User }
  | { ok: true; method: 'api_key' }
  | { ok: true; method: 'none' }
  | { ok: false; reason: 'missing' | 'invalid' }

export async function authenticateRequest(
  headers: Record<string, string | string[] | undefined>,
  options: {
    supabase: SupabaseAuthConfig | null
    apiKey: string | undefined
  },
): Promise<AuthResult> {
  const bearer = headerValue(headers.authorization)
  const token =
    bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : undefined
  const key = headerValue(headers['x-sanctum-key'])

  if (options.supabase && token) {
    const user = await verifySupabaseAccessToken(options.supabase, token)
    if (user) return { ok: true, method: 'supabase', user }
    return { ok: false, reason: 'invalid' }
  }

  if (options.apiKey && key === options.apiKey) {
    return { ok: true, method: 'api_key' }
  }

  if (options.supabase && key?.startsWith('sk_sanctum_')) {
    const { validateStoredApiKey } = await import('./api-keys.js')
    if (await validateStoredApiKey(options.supabase, key)) {
      return { ok: true, method: 'api_key' }
    }
  }

  if (options.supabase || options.apiKey) {
    return { ok: false, reason: 'missing' }
  }

  if (allowOpenApi()) {
    return { ok: true, method: 'none' }
  }

  if (isProduction()) {
    return { ok: false, reason: 'missing' }
  }

  return { ok: true, method: 'none' }
}

function headerValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}
