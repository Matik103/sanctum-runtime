import type { ActionRequest, ActionResult, Decision } from '@sanctum/sdk'
import { ActionRequestSchema } from '@sanctum/sdk'
import type { SanctumRuntime } from '@sanctum/sdk'
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
  /** Called only when decision is APPROVED. */
  execute: () => Promise<T>
}

export class AgentActionBlockedError extends Error {
  readonly result: ActionResult
  constructor(result: ActionResult) {
    super(`Action blocked: ${result.action} (${result.reasoning})`)
    this.name = 'AgentActionBlockedError'
    this.result = result
  }
}

export class AgentVerificationRequiredError extends Error {
  readonly result: ActionResult
  constructor(result: ActionResult) {
    super(`Verification required: ${result.action} (${result.reasoning})`)
    this.name = 'AgentVerificationRequiredError'
    this.result = result
  }
}

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
    const result = await this.verifyAction(
      {
        actor: options.actor,
        action: options.action,
        context: options.context,
      },
      { offlineMode: options.offlineMode, correlationId: options.correlationId },
    )
    assertExecutable(result.decision, result)
    const value = await options.execute()
    return { result, value }
  }
}

function assertExecutable(decision: Decision, result: ActionResult): void {
  if (decision === 'BLOCKED') throw new AgentActionBlockedError(result)
  if (decision === 'REQUIRE_VERIFICATION') throw new AgentVerificationRequiredError(result)
}
