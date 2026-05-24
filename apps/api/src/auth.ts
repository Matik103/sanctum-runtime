import { createHash } from 'node:crypto'
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

// ── Supabase JWT verification cache ──────────────────────────────────────────
// Every authenticated dashboard request previously made a network call to
// Supabase's /auth/v1/user endpoint to verify the bearer token, even though
// the same browser session re-presents the same JWT for the duration of its
// 1-hour lifetime. With a moderately active user that's 60+ identical
// round-trips per minute against an external service — measurable latency,
// quota burn, and a single point of failure.
//
// Cache the verified User by SHA-256(token) — never the raw token, so a heap
// dump doesn't leak credentials. Entries expire at min(now + TTL, jwt.exp),
// so the cache can never extend a token's validity beyond what Supabase itself
// would honor, and revocation propagates within TTL seconds.
//
// Bounded at 1024 entries with simple FIFO eviction: at 1024 active sessions
// per pod the cache is already a rounding-error vs the cost of the calls it
// saves, and FIFO avoids the per-touch bookkeeping cost of a true LRU.

const JWT_CACHE_TTL_MS = Math.min(
  300_000,
  Math.max(1000, Number(process.env.SANCTUM_JWT_CACHE_TTL_MS ?? 30_000) || 30_000),
)
const JWT_CACHE_MAX_ENTRIES = 1024

type CacheEntry = { user: User; expiresAt: number }
const jwtCache = new Map<string, CacheEntry>()

let jwtCacheHitTotal  = 0
let jwtCacheMissTotal = 0
export function getJwtCacheStats() {
  return { hits: jwtCacheHitTotal, misses: jwtCacheMissTotal, size: jwtCache.size }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function jwtExpiryMs(token: string): number | null {
  // JWTs are <header>.<payload>.<sig>; the payload is base64url-encoded JSON.
  // Parsing failures are non-fatal — we just won't shorten the cache TTL.
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export async function verifySupabaseAccessToken(
  config: SupabaseAuthConfig,
  accessToken: string,
): Promise<User | null> {
  const key = hashToken(accessToken)
  const now = Date.now()

  const cached = jwtCache.get(key)
  if (cached && cached.expiresAt > now) {
    jwtCacheHitTotal++
    return cached.user
  }
  // Lazy cleanup of the entry we just inspected; full sweeps happen on insert.
  if (cached) jwtCache.delete(key)

  jwtCacheMissTotal++
  const admin = createSupabaseAdmin(config)
  const { data, error } = await admin.auth.getUser(accessToken)
  if (error || !data.user) return null

  const jwtExp = jwtExpiryMs(accessToken)
  const ttlBound = now + JWT_CACHE_TTL_MS
  const expiresAt = jwtExp != null ? Math.min(jwtExp, ttlBound) : ttlBound

  // FIFO eviction when full — Map preserves insertion order so the oldest
  // entry is .keys().next().value
  if (jwtCache.size >= JWT_CACHE_MAX_ENTRIES) {
    const oldest = jwtCache.keys().next().value
    if (oldest !== undefined) jwtCache.delete(oldest)
  }
  jwtCache.set(key, { user: data.user, expiresAt })

  return data.user
}

/**
 * Invalidates a single cached JWT — call from sign-out handlers if you ever
 * add server-side session revocation. No-op if the token isn't cached.
 */
export function invalidateJwtCacheEntry(accessToken: string): void {
  jwtCache.delete(hashToken(accessToken))
}

export type AuthResult =
  | { ok: true; method: 'supabase'; user: User }
  | { ok: true; method: 'api_key'; orgScope?: string[] }
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
    const validation = await validateStoredApiKey(options.supabase, key)
    if (validation.valid) {
      return { ok: true, method: 'api_key', orgScope: validation.orgId ? [validation.orgId] : [] }
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
