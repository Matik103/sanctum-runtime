/**
 * Internal helper — shared action-gate logic used by every framework adapter.
 * Not part of the public API.
 */
import type { ActionResult } from '@sanctum-runtime/sdk'
import type { SanctumAdapterOptions, ActionContext } from './types.js'
import {
  SanctumActionTokenRequiredError,
  SanctumBlockedError,
  SanctumVerificationTimeoutError,
} from './errors.js'

function resolveCorrelationId(
  opt: SanctumAdapterOptions['correlationId'],
): string | undefined {
  if (opt == null) return undefined
  if (typeof opt === 'function') return opt()
  return opt
}

/**
 * Run the Sanctum gate for a single action invocation.
 * Throws SanctumBlockedError or SanctumVerificationTimeoutError on failure.
 * Returns when the action is approved and safe to proceed.
 */
export async function gate(
  ctx: ActionContext,
  options: SanctumAdapterOptions,
): Promise<ActionResult> {
  const { client, agentId, onApproved, onBlocked, onVerificationRequired, verificationTimeout } = options

  const actor = ctx.actor ?? agentId ?? 'agent'
  const correlationId = resolveCorrelationId(options.correlationId)

  const result = await client.verifyAction(
    {
      actor,
      action: ctx.action,
      context: {
        ...(ctx.params != null ? { params: ctx.params } : {}),
        ...(ctx.context ?? {}),
      },
    },
    correlationId != null ? { correlationId } : {},
  )

  if (result.decision === 'BLOCKED') {
    onBlocked?.(ctx.action, result.reasoning)
    throw new SanctumBlockedError({
      action: ctx.action,
      anomalyFlags: result.anomalyFlags,
      riskScore: result.modelConfidence ?? null,
      reasoning: result.reasoning,
    })
  }

  if (result.decision === 'REQUIRE_VERIFICATION') {
    const cid = result.correlationId
    onVerificationRequired?.(ctx.action, cid)

    let verificationStatus: { status: string; entry?: typeof result }
    try {
      verificationStatus = await client.waitForVerification(cid, {
        timeoutMs: verificationTimeout?.timeoutMs,
        pollIntervalMs: verificationTimeout?.pollIntervalMs,
      })
    } catch (_err) {
      throw new SanctumVerificationTimeoutError(
        ctx.action,
        cid,
        verificationTimeout?.timeoutMs,
      )
    }

    if (verificationStatus.status === 'blocked') {
      onBlocked?.(ctx.action, 'Blocked by operator during verification')
      throw new SanctumBlockedError({
        action: ctx.action,
        anomalyFlags: result.anomalyFlags,
        riskScore: result.modelConfidence ?? null,
        reasoning: 'Blocked by operator during verification',
      })
    }
    if (verificationStatus.status === 'approved' && verificationStatus.entry) {
      await assertApprovedActionToken(ctx, verificationStatus.entry, options)
      onApproved?.(ctx.action, verificationStatus.entry)
      return verificationStatus.entry
    }
  }

  // APPROVED — proceed
  await assertApprovedActionToken(ctx, result, options)
  onApproved?.(ctx.action, result)
  return result
}

async function assertApprovedActionToken(
  ctx: ActionContext,
  result: ActionResult,
  options: SanctumAdapterOptions,
): Promise<void> {
  if (!options.enforceActionToken) return

  const token = result.actionToken?.token
  if (!token) {
    throw new SanctumActionTokenRequiredError(ctx.action)
  }

  const verifyWithRuntime =
    typeof options.enforceActionToken === 'object'
      ? options.enforceActionToken.verifyWithRuntime !== false
      : true
  if (!verifyWithRuntime) return

  const verification = await options.client.verifyActionToken(token)
  if (!verification.valid) {
    throw new SanctumActionTokenRequiredError(ctx.action, verification.error ?? 'runtime rejected signed action token')
  }

  const payload = verification.payload ?? {}
  if (payload.action !== result.action || payload.actor !== result.actor) {
    throw new SanctumActionTokenRequiredError(ctx.action, 'signed action token does not match approved actor/action')
  }

  const expected = result.actionIdentity
  if (!expected) return
  if (expected.toolId && payload.toolId !== expected.toolId) {
    throw new SanctumActionTokenRequiredError(ctx.action, 'signed action token does not match approved tool identity')
  }
  if (expected.runtimeId && payload.runtimeId !== expected.runtimeId) {
    throw new SanctumActionTokenRequiredError(ctx.action, 'signed action token does not match approved runtime identity')
  }
  if (expected.environmentId && payload.environmentId !== expected.environmentId) {
    throw new SanctumActionTokenRequiredError(ctx.action, 'signed action token does not match approved environment identity')
  }
}
