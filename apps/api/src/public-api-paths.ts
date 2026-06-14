import { isProduction } from './security.js'

/**
 * Paths that skip the global JWT / X-Sanctum-Key gate.
 * Marketing support chat (/v1/support/*) is intentionally anonymous — visitors never sign in.
 */
export function isPublicApiPath(path: string): boolean {
  if (
    path === '/health' ||
    path === '/readiness' ||
    path === '/v1/billing/webhook' ||
    path === '/v1/verify-action' ||
    path === '/v1/push/vapid-key' ||
    path === '/.well-known/security.txt' ||
    path === '/v1/client-errors'
  ) return true
  if (path.startsWith('/v1/sso/')) return true
  if (path === '/v1/support/sessions') return true
  if (path === '/v1/support/chat') return true
  if (path === '/v1/support/chat/stream') return true
  if (/^\/v1\/support\/sessions\/[^/]+\/messages$/.test(path)) return true
  if (/^\/v1\/support\/sessions\/[^/]+\/escalate$/.test(path)) return true
  if (/^\/v1\/support\/messages\/[^/]+\/feedback$/.test(path)) return true
  if (!isProduction()) {
    if (path === '/' || path === '/metrics' || path === '/v1/status') return true
  }
  return false
}
