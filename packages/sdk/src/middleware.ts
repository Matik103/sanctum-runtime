import { SanctumActionBlockedError, SanctumVerificationRequiredError } from './errors.js'
import type { SanctumRuntime } from './runtime.js'
import type { ActionRequest, ActionResult } from './types.js'

export type SanctumMiddlewareContext = {
  actor?: string
  action: string
  context?: Record<string, unknown>
  offlineMode?: boolean
  execute: () => Promise<void> | void
}

/** Agent-style hook: verify → then run execute (PRD §4.6). */
export function createSanctumMiddleware(runtime: SanctumRuntime) {
  return async (ctx: SanctumMiddlewareContext): Promise<ActionResult> => {
    const request: ActionRequest = {
      actor: ctx.actor ?? 'agent',
      action: ctx.action,
      context: ctx.context ?? {},
    }
    const result = await runtime.verifyAction(request, { offlineMode: ctx.offlineMode })
    if (result.decision === 'BLOCKED') throw new SanctumActionBlockedError(result)
    if (result.decision === 'REQUIRE_VERIFICATION') {
      throw new SanctumVerificationRequiredError(result)
    }
    await ctx.execute()
    return result
  }
}

export type AttachableRuntime = {
  onAction?: (handler: ReturnType<typeof createSanctumMiddleware>) => void
}

/** Robotics / device attach point — registers middleware on a host (Phase 1 stub). */
export function attachSanctumRuntime<T extends AttachableRuntime>(
  host: T,
  runtime: SanctumRuntime,
): T & { sanctum: SanctumRuntime } {
  const middleware = createSanctumMiddleware(runtime)
  host.onAction?.(middleware)
  return Object.assign(host, { sanctum: runtime })
}
