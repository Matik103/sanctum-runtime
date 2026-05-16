import type { ActionRequest, ActionResult, Decision } from '@sanctum-runtime/sdk'
import { ActionRequestSchema, SanctumActionBlockedError, SanctumVerificationRequiredError } from '@sanctum-runtime/sdk'
import type { SanctumRuntime } from '@sanctum-runtime/sdk'
import type { AgentAction } from './actions.js'

export type AgentRuntimeAdapterOptions = {
  /** Default actor id for verify calls (e.g. workflow or session id). */
  actor?: string
  offlineMode?: boolean
}

export type AgentProtectOptions<T> = {
  action: AgentAction | string
  context?: Record<string, unknown>
  actor?: string
  correlationId?: string
  offlineMode?: boolean
  /**
   * After REQUIRE_VERIFICATION, poll until approved/blocked (uses correlationId).
   * Approve in the dashboard, then the agent continues without a second verify call.
   */
  awaitVerification?: { timeoutMs?: number; pollIntervalMs?: number }
  /** Called only when decision is APPROVED. */
  execute: () => Promise<T>
}

/** @deprecated Use SanctumActionBlockedError from @sanctum-runtime/sdk */
export class AgentActionBlockedError extends SanctumActionBlockedError {}

/** @deprecated Use SanctumVerificationRequiredError from @sanctum-runtime/sdk */
export class AgentVerificationRequiredError extends SanctumVerificationRequiredError {}

/** Normalizes agent-layer calls into Sanctum {@link ActionRequest}. */
export class AgentRuntimeAdapter {
  private defaultActor: string
  private defaultOffline: boolean

  constructor(
    private runtime: SanctumRuntime,
    options: AgentRuntimeAdapterOptions = {},
  ) {
    this.defaultActor = options.actor ?? 'agent'
    this.defaultOffline = options.offlineMode ?? false
  }

  normalize(input: {
    actor?: string
    action: AgentAction | string
    context?: Record<string, unknown>
  }): ActionRequest {
    return ActionRequestSchema.parse({
      actor: input.actor ?? this.defaultActor,
      action: input.action,
      context: input.context ?? {},
    })
  }

  verifyAction(
    input: Parameters<AgentRuntimeAdapter['normalize']>[0],
    options: { offlineMode?: boolean; correlationId?: string } = {},
  ): Promise<ActionResult> {
    const request = this.normalize(input)
    return this.runtime.verifyAction(request, {
      offlineMode: options.offlineMode ?? this.defaultOffline,
      correlationId: options.correlationId,
    })
  }

  /**
   * Intercept → verify → execute. Throws on block or verification required.
   * PRD integration north star: `sanctum.protect(agent)` style flows.
   */
  async protect<T>(options: AgentProtectOptions<T>): Promise<{ result: ActionResult; value: T }> {
    const correlationId = options.correlationId ?? crypto.randomUUID()
    let result = await this.verifyAction(
      {
        actor: options.actor,
        action: options.action,
        context: options.context,
      },
      { offlineMode: options.offlineMode, correlationId },
    )

    if (result.decision === 'REQUIRE_VERIFICATION' && options.awaitVerification) {
      const status = await this.runtime.waitForVerification(correlationId, options.awaitVerification)
      if (status.status === 'blocked' || !status.entry) {
        throw new SanctumActionBlockedError(status.entry ?? result)
      }
      result = status.entry
    }

    assertExecutable(result.decision, result)
    const value = await options.execute()
    return { result, value }
  }
}

function assertExecutable(decision: Decision, result: ActionResult): void {
  if (decision === 'BLOCKED') throw new SanctumActionBlockedError(result)
  if (decision === 'REQUIRE_VERIFICATION') throw new SanctumVerificationRequiredError(result)
}
