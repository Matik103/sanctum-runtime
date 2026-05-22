/**
 * Pydantic AI adapter for Sanctum Runtime.
 *
 * Pydantic AI is Python-first but exposes its tool registry over HTTP / JSON
 * for distributed agents. This adapter is the JS/TS side of that — useful
 * when a Pydantic AI agent runs in Python and your tool execution layer
 * (Node-based microservice) needs to gate calls before running them.
 *
 * For pure-Python integration use the official Sanctum Python SDK:
 *   pip install sanctum-runtime
 *   from sanctum_runtime import verify_action
 *
 * This TS adapter wraps the tool-dispatch endpoint so any HTTP-bridged
 * Pydantic AI tool runs through Sanctum first.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type PydanticAIToolCall = {
  /** Tool name as declared in @agent.tool */
  name: string
  /** Validated input dict (already type-checked by Pydantic). */
  input: Record<string, unknown>
  /** Run id from the Pydantic AI agent run. */
  runId?: string
  /** Optional dependency context (deps=) — fed in as Sanctum context. */
  deps?: Record<string, unknown>
}

/**
 * Gate a Pydantic AI tool call from a TS-side dispatcher.
 *
 * @example
 * ```ts
 * app.post('/tools/dispatch', async (req, reply) => {
 *   await gatePydanticAITool(req.body, { client, agentId: req.body.agent })
 *   return executeTool(req.body)
 * })
 * ```
 */
export async function gatePydanticAITool(
  call: PydanticAIToolCall,
  options: SanctumAdapterOptions,
): Promise<void> {
  await gate(
    {
      action: call.name,
      params: call.input,
      actor: options.agentId ?? 'pydantic-ai',
      context: {
        ...(call.deps ?? {}),
        runId: call.runId,
      },
    },
    {
      ...options,
      correlationId: call.runId ?? options.correlationId,
    },
  )
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
