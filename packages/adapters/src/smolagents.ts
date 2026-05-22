/**
 * Hugging Face smolagents adapter for Sanctum Runtime.
 *
 * smolagents is Python-first (`pip install smolagents`) but its tools are
 * trivially serializable: { name, description, inputs, output_type, forward }.
 * When a smolagents CodeAgent runs in Python and dispatches a tool over a
 * Node-based runner (common when the tool is a Web API), this adapter gates
 * the dispatch.
 *
 * For pure-Python integration use `sanctum-runtime` (PyPI):
 *   from sanctum_runtime import verify_action
 *   verify_action(actor='smolagents', action=tool_name, context=inputs)
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type SmolToolCall = {
  name: string
  inputs: Record<string, unknown>
  /** The agent's reasoning step number — threaded as causal chain. */
  step?: number
}

/**
 * Gate a smolagents tool call from a TS-side dispatcher.
 */
export async function gateSmolagentsCall(
  call: SmolToolCall,
  options: SanctumAdapterOptions,
): Promise<void> {
  await gate(
    {
      action: call.name,
      params: call.inputs,
      actor: options.agentId ?? 'smolagents',
      context: { step: call.step },
    },
    options,
  )
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
