import type { ActionResult, SanctumClient } from '@sanctum-runtime/sdk'

// Shared types across all adapters

export type SanctumAdapterOptions = {
  /** Sanctum client instance to use for action verification. */
  client: SanctumClient
  /** Optional agent identifier attached to every action request as the actor. */
  agentId?: string
  /**
   * Correlation ID to attach to the action request, or a factory function that
   * returns a fresh ID per call. Defaults to the correlationId returned by the
   * server when omitted.
   */
  correlationId?: string | (() => string)
  /**
   * Called when a tool/action is blocked by Sanctum policy.
   * Useful for logging or telemetry in addition to the thrown SanctumBlockedError.
   */
  onBlocked?: (action: string, reason: string) => void
  /**
   * Called when Sanctum requires human verification before the action may proceed.
   * The adapter will then wait for the verification to resolve.
   */
  onVerificationRequired?: (action: string, correlationId: string) => void
  /**
   * Called when Sanctum approves an action. Use result.actionToken at the final
   * executor boundary when you want side effects to require signed proof.
   */
  onApproved?: (action: string, result: ActionResult) => void
  /**
   * When enabled, the adapter refuses to continue unless the approved action
   * includes a signed Sanctum action token. By default the adapter also asks the
   * runtime API to verify the token before returning.
   */
  enforceActionToken?:
    | boolean
    | {
        verifyWithRuntime?: boolean
      }
  /**
   * Verification wait options forwarded to client.waitForVerification().
   */
  verificationTimeout?: {
    timeoutMs?: number
    pollIntervalMs?: number
  }
}

export type ActionContext = {
  /** The action name (matches tool name or function name). */
  action: string
  /** Parameters / arguments passed to the tool. */
  params?: Record<string, unknown>
  /** Actor identifier — e.g. the user or agent driving the call. */
  actor?: string
  /** Arbitrary additional context forwarded to Sanctum. */
  context?: Record<string, unknown>
}
