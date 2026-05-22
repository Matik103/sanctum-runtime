/**
 * LlamaIndex adapter for Sanctum Runtime.
 *
 * LlamaIndex (llamaindex npm) represents tools as objects with:
 *   { metadata: { name, description }, call: (input) => Promise<output> }
 *
 * Both FunctionTool and QueryEngineTool follow this shape. The adapter wraps
 * the `call` method so every tool invocation gates through Sanctum.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type LlamaIndexTool = {
  metadata: { name: string; description?: string; parameters?: Record<string, unknown> }
  call: (input: Record<string, unknown>) => Promise<unknown>
  [key: string]: unknown
}

/**
 * Wrap a LlamaIndex tool so Sanctum gates every call.
 *
 * @example
 * ```ts
 * import { FunctionTool } from 'llamaindex'
 * const tool = FunctionTool.from(transferFunds, { name: 'transfer_funds', ... })
 * const safe = wrapLlamaIndexTool(tool, { client, agentId: 'llamaindex:agent' })
 * const agent = new ReActAgent({ tools: [safe] })
 * ```
 */
export function wrapLlamaIndexTool(
  tool: LlamaIndexTool,
  options: SanctumAdapterOptions,
): LlamaIndexTool {
  const original = tool.call.bind(tool)
  return {
    ...tool,
    call: async (input) => {
      await gate(
        {
          action: tool.metadata.name,
          params: input,
          actor: options.agentId ?? 'llamaindex-agent',
          // RAG tool outputs are a classic indirect-injection vector
          context: { instructionSource: 'tool_output' },
        },
        options,
      )
      return original(input)
    },
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
