/** User-safe API error text — avoid leaking response bodies in production. */
export function sanitizeApiError(err: unknown, fallback = 'Request failed'): string {
  if (!(err instanceof Error)) return fallback
  if (import.meta.env.DEV) return err.message
  const m = redactSensitiveText(err.message)
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

export async function responseError(res: Response, fallback: string): Promise<ApiResponseError> {
  let body: ErrorBody | null = null
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    body = null
  }

  const code = stringValue(body?.error)
  const apiMessage = stringValue(body?.message) ?? stringValue(body?.detail)
  const message = apiMessage
    ?? (code ? code.replace(/_/g, ' ') : `${fallback} (${res.status})`)
  const isEntitlementError =
    res.status === 402 ||
    code === 'plan_feature_required' ||
    code === 'quota_exceeded' ||
    code === 'agent_limit_reached'
  const safeMessage = isEntitlementError && apiMessage
    ? redactSensitiveText(apiMessage)
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
    /quota .*upgrade|upgrade .*quota/i.test(message) ||
    /upgrade (your )?plan/i.test(message) ||
    // API entitlement wordings (entitlements-gate.ts):
    // "X is not included on Developer. Upgrade to Team to use this feature."
    /not included on/i.test(message) ||
    /upgrade to (a |the )?(personal|operator|team|enterprise)/i.test(message) ||
    // "Your Developer plan allows 2 active agents. Revoke an agent or upgrade to add more."
    /plan allows \d+/i.test(message) ||
    /upgrade to add/i.test(message) ||
    // "Monthly governed actions quota reached (... / ...)."
    /quota (reached|exceeded)/i.test(message) ||
    // Governed-block reasoning: "Developer is observe-only. Upgrade to verify..."
    /observe-only/i.test(message)
  )
}
