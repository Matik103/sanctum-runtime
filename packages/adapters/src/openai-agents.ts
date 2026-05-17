/**
 * OpenAI Agents SDK adapter for Sanctum Runtime.
 *
 * Works via duck typing — no import from '@openai/agents'.
 * The OpenAI Agents SDK represents function tools as:
 *   { name, description, parameters (JSON Schema), execute: async (params) => result }
 *
 * Two integration styles are provided:
 *   1. wrapAgentTool  — wrap a single FunctionTool at definition time.
 *   2. createSanctumAgentHook — lifecycle hook for agent runners that support
 *      onToolCall/beforeToolCall hooks (e.g. custom runners or middleware layers).
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError } from './errors.js'

/** Minimal interface matching the OpenAI Agents SDK FunctionTool shape. */
export type OpenAIFunctionTool = {
  name: string
  description?: string
  /** JSON Schema object for the function's parameters. */
  parameters?: Record<string, unknown>
  execute: (params: Record<string, unknown>, ...rest: unknown[]) => Promise<unknown>
  /** Allow extra fields (type, strict, …) to pass through. */
  [key: string]: unknown
}

/**
 * Wraps a single OpenAI Agents SDK function tool with a Sanctum gate.
 *
 * @example
 * ```ts
 * const safeTool = wrapAgentTool(myFunctionTool, { client })
 * const agent = new Agent({ tools: [safeTool] })
 * ```
 */
export function wrapAgentTool(
  tool: OpenAIFunctionTool,
  options: SanctumAdapterOptions,
): OpenAIFunctionTool {
  const originalExecute = tool.execute

  const gatedExecute = async (
    params: Record<string, unknown>,
    ...rest: unknown[]
  ): Promise<unknown> => {
    await gate(
      {
        action: tool.name,
        params,
        actor: options.agentId,
      },
      options,
    )

    return originalExecute(params, ...rest)
  }

  return { ...tool, execute: gatedExecute }
}

/** The hook object returned by createSanctumAgentHook. */
export type AgentHook = {
  /**
   * Called before a tool executes. Throws SanctumBlockedError if the action
   * is blocked or fails verification, preventing the tool from running.
   */
  onToolCall: (toolName: string, params: Record<string, unknown>) => Promise<void>
}

/**
 * Creates a lifecycle hook compatible with OpenAI Agents SDK runner customisation.
 *
 * Use this when you can't easily replace individual tool objects but have access
 * to the runner's hook/middleware API.
 *
 * @example
 * ```ts
 * const hook = createSanctumAgentHook({ client })
 * // In a custom runner:
 * await hook.onToolCall(toolName, parsedParams)
 * ```
 */
export function createSanctumAgentHook(options: SanctumAdapterOptions): AgentHook {
  return {
    async onToolCall(toolName, params) {
      await gate(
        {
          action: toolName,
          params,
          actor: options.agentId,
        },
        options,
      )
    },
  }
}

export { SanctumBlockedError }
