/** Production detection — Render sets RENDER=true; NODE_ENV=production in most hosts. */
export function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.SANCTUM_ENV === 'production'
  )
}

export function allowOpenApi(): boolean {
  return process.env.SANCTUM_ALLOW_OPEN_API === 'true' && !isProduction()
}

/** Stable client-facing 500 body — never leak stack or DB messages in production. */
export function internalErrorBody(
  err: unknown,
): { error: string; detail?: string; request_id?: string } {
  if (!isProduction() && err instanceof Error && err.message) {
    return { error: 'internal_error', detail: err.message }
  }
  return { error: 'internal_error' }
}

export function clientErrorMessage(
  status: number,
  body?: { error?: string; hint?: string },
): string {
  const code = body?.error ?? 'request_failed'
  if (isProduction()) {
    if (status === 401) return 'Unauthorized'
    if (status === 403) return 'Forbidden'
    if (status === 404) return 'Not found'
    if (status === 429) return 'Too many requests'
    return 'Request failed'
  }
  return body?.hint ?? body?.error ?? `Request failed (${status})`
}

export function metricsAuthorized(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const secret = process.env.METRICS_SECRET?.trim()
  if (!secret) return !isProduction()
  const auth = headers.authorization
  const bearer = Array.isArray(auth) ? auth[0] : auth
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7).trim() : undefined
  const key = headers['x-metrics-key']
  const headerKey = Array.isArray(key) ? key[0] : key
  return token === secret || headerKey === secret
}

export function maskWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}/…`
  } catch {
    return 'configured'
  }
}
