/** User-safe API error text — avoid leaking response bodies in production. */
export function sanitizeApiError(err: unknown, fallback = 'Request failed'): string {
  if (!(err instanceof Error)) return fallback
  if (import.meta.env.DEV) return err.message
  const m = err.message
  if (/\b401\b/.test(m)) return 'Unauthorized'
  if (/\b403\b/.test(m)) return 'Forbidden'
  if (/\b404\b/.test(m)) return 'Not found'
  if (/\b429\b/.test(m)) return 'Too many requests'
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return 'Cannot reach the API. Check your connection and try again.'
  }
  if (/\b5\d{2}\b/.test(m)) return 'Server error — try again shortly'
  return fallback
}
