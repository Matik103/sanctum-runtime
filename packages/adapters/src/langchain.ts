/**
 * LangChain adapter for Sanctum Runtime.
 *
 * Works via duck typing — no import from 'langchain' or '@langchain/core'.
 * A "tool" is any object that has { name: string, description: string, func: Function }.
 * The wrapper matches this interface so it is drop-in compatible with LangChain's
 * DynamicTool, StructuredTool, and similar constructs.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'

/** Minimal interface that matches LangChain DynamicTool / StructuredTool shape. */
export type LangChainToolDefinition = {
  name: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  func: (input: any, ...rest: any[]) => Promise<unknown>
  // Allow arbitrary extra fields (returnDirect, tags, etc.) to pass through
  [key: string]: unknown
}

/**
 * Wraps a single LangChain-style tool with a Sanctum gate.
 *
 * The returned object is a shallow copy of the original tool definition with
 * `func` replaced by a gated version. All other fields (name, description,
 * returnDirect, schema, …) are preserved.
 */
export function wrapLangChainTool(
  tool: LangChainToolDefinition,
  options: SanctumAdapterOptions,
): LangChainToolDefinition {
  const originalFunc = tool.func

  const gatedFunc = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...rest: any[]
  ): Promise<unknown> => {
    const params: Record<string, unknown> =
      input != null && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : { input }

    await gate(
      {
        action: tool.name,
        params,
        actor: options.agentId,
      },
      options,
    )

    return originalFunc(input, ...rest)
  }

  return { ...tool, func: gatedFunc }
}

/**
 * Wraps every tool in an array with a Sanctum gate.
 *
 * @example
 * ```ts
 * const tools = createSanctumTools([searchTool, calculatorTool], { client })
 * const agent = await createReactAgent({ llm, tools })
 * ```
 */
export function createSanctumTools(
  tools: LangChainToolDefinition[],
  options: SanctumAdapterOptions,
): LangChainToolDefinition[] {
  return tools.map((tool) => wrapLangChainTool(tool, options))
}

/** @deprecated Use wrapLangChainTool — renamed for clarity. */
export const SanctumToolWrapper = wrapLangChainTool
