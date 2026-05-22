import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ActionResult, ActionToken } from '@sanctum-runtime/sdk'

type ActionTokenPayload = {
  aud: 'sanctum.action'
  jti: string
  actor: string
  action: string
  orgId?: string
  auditId: string
  correlationId: string
  decision: 'APPROVED'
  iat: number
  exp: number
}

export type VerifiedActionToken = ActionTokenPayload

export function issueActionToken(result: ActionResult, ttlSeconds = 300): ActionToken | undefined {
  if (result.decision !== 'APPROVED') return undefined
  const secret = actionTokenSecret()
  if (!secret) return undefined

  const now = Math.floor(Date.now() / 1000)
  const orgId = typeof result.context?.org_id === 'string'
    ? result.context.org_id
    : typeof result.context?.orgId === 'string'
      ? result.context.orgId
      : undefined
  const payload: ActionTokenPayload = {
    aud: 'sanctum.action',
    jti: randomUUID(),
    actor: result.actor,
    action: result.action,
    orgId,
    auditId: result.id,
    correlationId: result.correlationId,
    decision: 'APPROVED',
    iat: now,
    exp: now + ttlSeconds,
  }
  const encoded = base64UrlJson(payload)
  const sig = sign(encoded, secret)
  return {
    token: `${encoded}.${sig}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    scope: {
      actor: payload.actor,
      action: payload.action,
      orgId,
      auditId: payload.auditId,
      correlationId: payload.correlationId,
    },
  }
}

export function verifyActionToken(token: string): VerifiedActionToken | null {
  const secret = actionTokenSecret()
  if (!secret) return null
  const [encoded, sig] = token.split('.')
  if (!encoded || !sig) return null
  const expected = sign(encoded, secret)
  if (!safeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ActionTokenPayload
    if (payload.aud !== 'sanctum.action') return null
    if (payload.decision !== 'APPROVED') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function actionTokenSecret(): string | undefined {
  return (
    process.env.SANCTUM_ACTION_TOKEN_SECRET?.trim() ||
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim() ||
    undefined
  )
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
