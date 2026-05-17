/**
 * Vercel AI SDK adapter for Sanctum Runtime.
 *
 * Works via duck typing — no import from 'ai'.
 * The Vercel AI SDK represents tools as:
 *   { description: string, parameters: ZodSchema, execute: async (params) => result }
 *
 * This adapter wraps the execute function with a Sanctum gate before delegation.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'

/** Minimal interface matching the Vercel AI SDK's CoreTool shape. */
export type VercelAIToolDefinition<TParams = Record<string, unknown>> = {
  description?: string
  /** Zod schema (or any schema object) — passed through untouched. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: any
  execute: (params: TParams, ...rest: unknown[]) => Promise<unknown>
  /** Allow extra fields (e.g. experimental_toToolResultContent) to pass through. */
  [key: string]: unknown
}

/**
 * Wraps a single Vercel AI SDK tool with a Sanctum gate.
 *
 * @param actionName - Logical action name sent to Sanctum (usually the tool's key in the tools map).
 * @param toolDef    - The original tool definition.
 * @param options    - Sanctum adapter options.
 *
 * @example
 * ```ts
 * const tools = {
 *   sendEmail: sanctumTool('sendEmail', {
 *     description: 'Send an email',
 *     parameters: z.object({ to: z.string(), body: z.string() }),
 *     execute: async ({ to, body }) => sendEmailImpl(to, body),
 *   }, { client }),
 * }
 * ```
 */
export function sanctumTool<TParams = Record<string, unknown>>(
  actionName: string,
  toolDef: VercelAIToolDefinition<TParams>,
  options: SanctumAdapterOptions,
): VercelAIToolDefinition<TParams> {
  const originalExecute = toolDef.execute

  const gatedExecute = async (
    params: TParams,
    ...rest: unknown[]
  ): Promise<unknown> => {
    await gate(
      {
        action: actionName,
        params:
          params != null && typeof params === 'object' && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : { value: params },
        actor: options.agentId,
      },
      options,
    )

    return originalExecute(params, ...rest)
  }

  return { ...toolDef, execute: gatedExecute }
}

/**
 * Middleware-style helper: wraps every tool in a tools map.
 *
 * @example
 * ```ts
 * const gatedTools = createSanctumMiddleware({ client })(rawTools)
 * const result = await generateText({ model, tools: gatedTools, prompt })
 * ```
 */
export function createSanctumMiddleware(
  options: SanctumAdapterOptions,
): (tools: Record<string, VercelAIToolDefinition>) => Record<string, VercelAIToolDefinition> {
  return (tools) => {
    const wrapped: Record<string, VercelAIToolDefinition> = {}
    for (const [name, toolDef] of Object.entries(tools)) {
      wrapped[name] = sanctumTool(name, toolDef, options)
    }
    return wrapped
  }
}
