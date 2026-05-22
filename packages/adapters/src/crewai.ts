/**
 * CrewAI adapter for Sanctum Runtime.
 *
 * CrewAI is a Python-first multi-agent framework. Its JavaScript / Node port
 * (and CrewAI-compatible JS frameworks) represent tools as objects with a
 * `name`, `description`, and a `_run(input)` or `run(input)` async method.
 *
 * This adapter wraps a CrewAI tool so every invocation passes through
 * Sanctum before the side effect runs.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

/** Minimal interface matching a CrewAI tool. Supports both run / _run conventions. */
export type CrewAITool = {
  name: string
  description?: string
  /** Either run() or _run() depending on the CrewAI variant. */
  run?: (input: Record<string, unknown>) => Promise<unknown>
  _run?: (input: Record<string, unknown>) => Promise<unknown>
  /** Allow extra fields (args_schema, etc.) to pass through. */
  [key: string]: unknown
}

/**
 * Wrap a CrewAI tool with a Sanctum gate.
 *
 * @example
 * ```ts
 * import { wrapCrewAITool } from '@sanctum-runtime/adapters'
 * const safeTool = wrapCrewAITool(myTool, { client, agentId: 'crew:analyst' })
 * const crew = new Crew({ tools: [safeTool], agents: [...] })
 * ```
 */
export function wrapCrewAITool(
  tool: CrewAITool,
  options: SanctumAdapterOptions,
): CrewAITool {
  const runImpl = tool.run ?? tool._run
  if (!runImpl) {
    throw new Error(`CrewAI tool "${tool.name}" has neither run() nor _run() — cannot wrap`)
  }

  const gated = async (input: Record<string, unknown>): Promise<unknown> => {
    await gate(
      {
        action: tool.name,
        params: input,
        actor: options.agentId ?? 'crewai-agent',
      },
      options,
    )
    return runImpl.call(tool, input)
  }

  return {
    ...tool,
    run: gated,
    _run: gated,
  }
}

/**
 * Crew-level guard: wrap the entire crew kickoff so a single hook gates every
 * tool call without having to re-wrap each tool individually. Pass this as a
 * `taskCallback` / `beforeAction` middleware where the CrewAI variant supports it.
 */
export function createSanctumCrewHook(options: SanctumAdapterOptions): {
  beforeToolCall: (toolName: string, input: Record<string, unknown>) => Promise<void>
} {
  return {
    async beforeToolCall(toolName, input) {
      await gate(
        {
          action: toolName,
          params: input,
          actor: options.agentId ?? 'crewai-agent',
        },
        options,
      )
    },
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
