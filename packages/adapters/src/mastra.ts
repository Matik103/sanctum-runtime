/**
 * Mastra framework adapter for Sanctum Runtime.
 *
 * Works via duck typing — no import from '@mastra/core'.
 * Mastra represents tools as:
 *   { id: string, description: string, inputSchema: ZodSchema, execute: async (ctx) => result }
 *
 * Two integration styles are provided:
 *   1. wrapMastraTool  — wrap a single MastraTool at definition time.
 *   2. createSanctumMastraMiddleware — middleware that intercepts all tool calls in a map.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'

/** Minimal interface matching the Mastra createTool shape. */
export type MastraTool = {
  id: string
  description?: string
  /** Zod schema (or any schema object) — passed through untouched. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (context: any, ...rest: unknown[]) => Promise<unknown>
  /** Allow extra fields (outputSchema, etc.) to pass through. */
  [key: string]: unknown
}

/** Middleware object returned by createSanctumMastraMiddleware. */
export type MastraMiddleware = {
  /**
   * Intercepts a tool call before it executes.
   * Throws SanctumBlockedError or SanctumVerificationTimeoutError when blocked.
   */
  beforeToolCall: (
    toolId: string,
    context: Record<string, unknown>,
  ) => Promise<void>
}

/**
 * Wraps a single Mastra tool with a Sanctum gate.
 *
 * The returned object is a shallow copy of the original tool with `execute`
 * replaced by a gated version. All other fields (id, description, inputSchema,
 * outputSchema, …) are preserved.
 *
 * @example
 * ```ts
 * const safeTool = wrapMastraTool(sendEmailTool, { client })
 * const agent = new Agent({ tools: { sendEmail: safeTool } })
 * ```
 */
export function wrapMastraTool(
  tool: MastraTool,
  options: SanctumAdapterOptions,
): MastraTool {
  const originalExecute = tool.execute

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gatedExecute = async (context: any, ...rest: unknown[]): Promise<unknown> => {
    const params: Record<string, unknown> =
      context != null &&
      typeof context === 'object' &&
      !Array.isArray(context) &&
      'context' in context &&
      context.context != null &&
      typeof context.context === 'object'
        ? (context.context as Record<string, unknown>)
        : context != null && typeof context === 'object' && !Array.isArray(context)
          ? (context as Record<string, unknown>)
          : { value: context }

    await gate(
      {
        action: tool.id,
        params,
        actor: options.agentId,
      },
      options,
    )

    return originalExecute(context, ...rest)
  }

  return { ...tool, execute: gatedExecute }
}

/**
 * Returns a middleware object that gates every tool call through Sanctum.
 *
 * Use this when you manage a map of tools (e.g. an agent's tool registry) and
 * want to intercept all calls without replacing each tool individually.
 *
 * @example
 * ```ts
 * const middleware = createSanctumMastraMiddleware({ client })
 *
 * // In a custom Mastra agent runner, before each tool invocation:
 * await middleware.beforeToolCall(toolId, inputContext)
 * ```
 */
export function createSanctumMastraMiddleware(
  options: SanctumAdapterOptions,
): MastraMiddleware {
  return {
    async beforeToolCall(toolId, context) {
      await gate(
        {
          action: toolId,
          params: context,
          actor: options.agentId,
        },
        options,
      )
    },
  }
}
