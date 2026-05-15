export { AgentActions, AGENT_ACTIONS, type AgentAction } from './actions.js'
export {
  AgentRuntimeAdapter,
  AgentActionBlockedError,
  AgentVerificationRequiredError,
  type AgentRuntimeAdapterOptions,
  type AgentProtectOptions,
} from './adapter.js'

import type { SanctumRuntime } from '@sanctum/sdk'
import { AgentRuntimeAdapter, type AgentProtectOptions } from './adapter.js'

/** One-line guard for agent runtimes (PRD §17). */
export function protectAgent<T>(
  runtime: SanctumRuntime,
  options: AgentProtectOptions<T> & { actor?: string },
): Promise<{ result: import('@sanctum/sdk').ActionResult; value: T }> {
  const adapter = new AgentRuntimeAdapter(runtime, { actor: options.actor })
  return adapter.protect(options)
}
