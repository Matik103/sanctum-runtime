import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ActionResult, ActionToken } from '@sanctum-runtime/sdk'

/**
 * Action tokens make Sanctum enforceable infrastructure rather than advisory.
 * After an APPROVED decision, the runtime signs a short-lived token that the
 * downstream executor MUST verify before running the side effect.
 */

const DEFAULT_TTL_SECONDS = 300

function signingKey(): string {
  const key =
    process.env.SANCTUM_ACTION_TOKEN_SECRET?.trim() ||
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim()

  if (key) return key

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.SANCTUM_ENV === 'production'
  ) {
    throw new Error(
      'SANCTUM_ACTION_TOKEN_SECRET (or SANCTUM_API_KEY_PEPPER / SANCTUM_API_KEY) must be set in production',
    )
  }

  return 'sanctum-dev-action-token-secret'
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

type TokenPayload = {
  actor: string
  action: string
  orgId?: string
  auditId: string
  correlationId: string
  toolId?: string
  runtimeId?: string
  environmentId?: string
  requestedPermission?: string
  scope?: string[]
  correlationChain?: string[]
  iat: number
  exp: number
  /** Optional: blast radius level baked in so executors can downgrade if needed */
  bl?: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Mint a signed action token for an APPROVED ActionResult.
 * Returns `null` for non-APPROVED decisions to make misuse obvious.
 */
export function issueActionToken(
  result: ActionResult,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): ActionToken | null {
  if (result.decision !== 'APPROVED') return null
  const ctx = (result.context ?? {}) as Record<string, unknown>
  const orgId = typeof ctx.org_id === 'string' ? ctx.org_id : undefined
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Math.max(1, ttlSeconds)
  const payload: TokenPayload = {
    actor: result.actor,
    action: result.action,
    orgId,
    auditId: result.id,
    correlationId: result.correlationId,
    toolId: result.actionIdentity?.toolId,
    runtimeId: result.actionIdentity?.runtimeId,
    environmentId: result.actionIdentity?.environmentId,
    requestedPermission: result.actionIdentity?.requestedPermission,
    scope: result.actionIdentity?.scope,
    correlationChain: result.actionIdentity?.correlationChain,
    iat,
    exp,
    bl: result.blastRadius?.level,
  }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'SAT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = b64url(createHmac('sha256', signingKey()).update(`${header}.${body}`).digest())
  return {
    token: `${header}.${body}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    scope: {
      actor: result.actor,
      action: result.action,
      orgId,
      auditId: result.id,
      correlationId: result.correlationId,
      toolId: result.actionIdentity?.toolId,
      runtimeId: result.actionIdentity?.runtimeId,
      environmentId: result.actionIdentity?.environmentId,
      requestedPermission: result.actionIdentity?.requestedPermission,
      scope: result.actionIdentity?.scope,
    },
  }
}

/**
 * Verify a Sanctum action token. Returns the decoded payload, or `null` when
 * the token is malformed, expired, or signed with a different key.
 *
 * Executors must check the returned `actor`/`action`/`orgId` match the side
 * effect they're about to run — never trust the token blindly.
 */
export function verifyActionToken(token: string): TokenPayload | null {
  if (typeof token !== 'string' || token.length < 16) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = createHmac('sha256', signingKey()).update(`${header}.${body}`).digest()
  let provided: Buffer
  try {
    provided = b64urlDecode(sig)
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as TokenPayload
  } catch {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null
  return payload
}
