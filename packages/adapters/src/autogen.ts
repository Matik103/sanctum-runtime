/**
 * Microsoft AutoGen adapter for Sanctum Runtime.
 *
 * AutoGen represents tools as either:
 *   - FunctionTool objects with { name, description, func }
 *   - ConversableAgent register_for_execution() decorators
 *
 * The JS/TS port (and direct REST-style calls) hand off a function call
 * descriptor. This adapter wraps a "tool runner" so each AutoGen tool
 * invocation flows through Sanctum before its handler executes.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type AutoGenTool = {
  name: string
  description?: string
  /** AutoGen tool functions are typically (input: object) => Promise<any>. */
  func: (input: Record<string, unknown>) => Promise<unknown>
  [key: string]: unknown
}

/**
 * Wrap an AutoGen tool so Sanctum gates every invocation.
 *
 * @example
 * ```ts
 * const safeTool = wrapAutoGenTool(myTool, { client, agentId: 'autogen:research' })
 * await agent.register_for_execution()(safeTool.func)
 * ```
 */
export function wrapAutoGenTool(
  tool: AutoGenTool,
  options: SanctumAdapterOptions,
): AutoGenTool {
  const original = tool.func
  return {
    ...tool,
    func: async (input) => {
      await gate(
        {
          action: tool.name,
          params: input,
          actor: options.agentId ?? 'autogen-agent',
        },
        options,
      )
      return original(input)
    },
  }
}

/**
 * Multi-agent group-chat hook: AutoGen's GroupChatManager fires before each
 * agent speaks / takes a tool action. Use this to gate the manager itself
 * (one fan-out gate for the whole conversation).
 */
export function createSanctumAutoGenHook(options: SanctumAdapterOptions): {
  beforeAgentAction: (agentName: string, toolName: string, input: Record<string, unknown>) => Promise<void>
} {
  return {
    async beforeAgentAction(agentName, toolName, input) {
      await gate(
        {
          action: toolName,
          params: input,
          actor: `${options.agentId ?? 'autogen'}:${agentName}`,
        },
        options,
      )
    },
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
