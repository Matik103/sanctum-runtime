/** User-safe API error text — avoid leaking response bodies in production. */
export function sanitizeApiError(err: unknown, fallback = 'Request failed'): string {
  if (!(err instanceof Error)) return fallback
  const m = err.message
  if (looksLikeUpgradeMessage(m)) return m
  if (import.meta.env.DEV) return m
  const redacted = redactSensitiveText(m)
  if (looksLikeUpgradeMessage(redacted)) return redacted
  if (/\b401\b/.test(redacted)) return 'Unauthorized'
  if (/\b403\b/.test(redacted)) return 'Forbidden'
  if (/\b404\b/.test(redacted)) return 'Not found'
  if (/\b429\b/.test(redacted)) return 'Too many requests'
  if (/\b402\b/.test(redacted)) return m.includes('Upgrade') ? m : 'This feature requires a paid plan. Upgrade on Billing to continue.'
  if (/failed to fetch|networkerror|load failed/i.test(redacted)) {
    return 'Cannot reach the API. Check your connection and try again.'
  }
  if (/\b5\d{2}\b/.test(redacted)) return 'Server error — try again shortly'
  return fallback
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/sk_(?:sanctum|agent|proj)_[A-Za-z0-9_-]+/g, 'sk_...redacted')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'jwt.redacted')
    .replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, 'Supabase')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, 'redacted')
}

export class ApiResponseError extends Error {
  status: number
  code?: string
  feature?: string
  upgradeUrl?: string
  currentPlan?: string
  planName?: string

  constructor(message: string, opts: {
    status: number
    code?: string
    feature?: string
    upgradeUrl?: string
    currentPlan?: string
    planName?: string
  }) {
    super(message)
    this.name = 'ApiResponseError'
    this.status = opts.status
    this.code = opts.code
    this.feature = opts.feature
    this.upgradeUrl = opts.upgradeUrl
    this.currentPlan = opts.currentPlan
    this.planName = opts.planName
  }
}

type ErrorBody = {
  error?: unknown
  detail?: unknown
  message?: unknown
  feature?: unknown
  upgradeUrl?: unknown
  currentPlan?: unknown
  planName?: unknown
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function defaultEntitlementMessage(code: string | undefined, fallback: string): string {
  if (code === 'quota_exceeded') {
    return 'Monthly quota reached. Upgrade your plan on Billing to continue.'
  }
  if (code === 'agent_limit_reached') {
    return 'Active agent limit reached. Revoke an agent or upgrade on Billing.'
  }
  if (code === 'plan_feature_required') {
    return 'This feature is not included on your current plan. Upgrade on Billing to unlock it.'
  }
  return fallback
}

export async function responseError(res: Response, fallback: string): Promise<ApiResponseError> {
  let body: ErrorBody | null = null
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    body = null
  }

  const code = stringValue(body?.error)
  const apiMessage = stringValue(body?.message) ?? stringValue(body?.detail)
  const isEntitlementError =
    res.status === 402 ||
    code === 'plan_feature_required' ||
    code === 'quota_exceeded' ||
    code === 'agent_limit_reached'

  const message = isEntitlementError
    ? (apiMessage ?? defaultEntitlementMessage(code, fallback))
    : (apiMessage ?? (code ? code.replace(/_/g, ' ') : `${fallback} (${res.status})`))

  const safeMessage = isEntitlementError
    ? redactSensitiveText(message)
    : sanitizeApiError(new Error(message), fallback)

  return new ApiResponseError(
    safeMessage,
    {
      status: res.status,
      code,
      feature: stringValue(body?.feature),
      upgradeUrl: stringValue(body?.upgradeUrl),
      currentPlan: stringValue(body?.currentPlan),
      planName: stringValue(body?.planName),
    },
  )
}

export async function throwResponseError(res: Response, fallback: string): Promise<never> {
  throw await responseError(res, fallback)
}

export function isUpgradeError(err: unknown): err is ApiResponseError {
  return err instanceof ApiResponseError && (
    err.status === 402 ||
    err.code === 'plan_feature_required' ||
    err.code === 'quota_exceeded' ||
    err.code === 'agent_limit_reached'
  )
}

export function looksLikeUpgradeMessage(message: string): boolean {
  return (
    /plan feature required/i.test(message) ||
    /requires? .*(plan|personal|operator|team|enterprise)/i.test(message) ||
    /requires (personal|operator|team|enterprise)/i.test(message) ||
    /quota .*upgrade|upgrade .*quota/i.test(message) ||
    /upgrade (your )?plan/i.test(message) ||
    /not included on/i.test(message) ||
    /upgrade to (a |the )?(personal|operator|team|enterprise)/i.test(message) ||
    /plan allows \d+/i.test(message) ||
    /upgrade to add/i.test(message) ||
    /quota (reached|exceeded)/i.test(message) ||
    /observe-only/i.test(message) ||
    /policy changes require/i.test(message) ||
    /paid plan/i.test(message) ||
    /not included on your current plan/i.test(message) ||
    /agent limit reached/i.test(message)
  )
}

/** True when an API failure is an entitlement / quota gate (not infra). */
export function isEntitlementFailure(err: unknown): boolean {
  if (isUpgradeError(err)) return true
  if (err instanceof Error && looksLikeUpgradeMessage(err.message)) return true
  return false
}

/** Normalize thrown values for display — preserves upgrade copy in production. */
export function formatApiError(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiResponseError) return err.message
  if (err instanceof Error) return sanitizeApiError(err, fallback)
  if (typeof err === 'string' && err.trim()) return err
  return fallback
}
