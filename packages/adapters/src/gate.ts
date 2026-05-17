/**
 * Internal helper — shared action-gate logic used by every framework adapter.
 * Not part of the public API.
 */
import type { SanctumAdapterOptions, ActionContext } from './types.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

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
): Promise<void> {
  const { client, agentId, onBlocked, onVerificationRequired, verificationTimeout } = options

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

    let verificationStatus: { status: string }
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
    // status === 'approved' — fall through and allow execution
  }

  // APPROVED — proceed
}
