/**
 * Model Context Protocol (MCP) adapter for Sanctum Runtime.
 *
 * MCP is the Anthropic-defined protocol that lets LLM clients (Claude
 * Desktop, MCP-aware tools) talk to capability servers. Each MCP server
 * exposes a list of "tools" with a JSON-Schema input shape and a handler.
 *
 * This adapter wraps an MCP tool handler so Sanctum gates the call before
 * the side effect runs. The MCP server protocol surface is small and stable
 * — we duck-type the handler signature rather than importing
 * `@modelcontextprotocol/sdk` so we keep zero peer deps.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

/** Minimal interface matching an MCP tool definition. */
export type McpTool = {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  handler: (input: Record<string, unknown>, extra?: unknown) => Promise<unknown>
  /** Allow extra protocol fields to pass through. */
  [key: string]: unknown
}

/**
 * MCP-style instructionSource — used by the Sanctum policy engine to know
 * the call came from an MCP tool. This lets policies say "block shell
 * execution when the instruction originated from tool output".
 *
 * Callers can override via `options.instructionSource`.
 */
const DEFAULT_INSTRUCTION_SOURCE = 'tool_output' as const

/**
 * Wrap a single MCP tool handler with a Sanctum gate.
 *
 * @example
 * ```ts
 * import { Server } from '@modelcontextprotocol/sdk/server'
 * import { wrapMcpTool } from '@sanctum-runtime/adapters'
 * const safeTool = wrapMcpTool(myTool, { client, agentId: 'mcp:filesystem' })
 * server.tool(safeTool.name, safeTool.inputSchema, safeTool.handler)
 * ```
 */
export function wrapMcpTool(
  tool: McpTool,
  options: SanctumAdapterOptions & { instructionSource?: string },
): McpTool {
  const originalHandler = tool.handler
  const instructionSource = options.instructionSource ?? DEFAULT_INSTRUCTION_SOURCE
  return {
    ...tool,
    handler: async (input, extra) => {
      await gate(
        {
          action: tool.name,
          params: input,
          actor: options.agentId ?? 'mcp-client',
          context: { instructionSource },
        },
        options,
      )
      return originalHandler(input, extra)
    },
  }
}

/**
 * Hook that an MCP server runtime can call before dispatching to a tool.
 * Throws SanctumBlockedError when the action is denied.
 *
 * @example
 * ```ts
 * server.setRequestHandler('tools/call', async (req) => {
 *   await hook.beforeToolCall(req.params.name, req.params.arguments)
 *   return realDispatch(req)
 * })
 * ```
 */
export function createSanctumMcpHook(
  options: SanctumAdapterOptions & { instructionSource?: string },
): {
  beforeToolCall: (toolName: string, args: Record<string, unknown>) => Promise<void>
} {
  return {
    async beforeToolCall(toolName, args) {
      await gate(
        {
          action: toolName,
          params: args,
          actor: options.agentId ?? 'mcp-client',
          context: { instructionSource: options.instructionSource ?? DEFAULT_INSTRUCTION_SOURCE },
        },
        options,
      )
    },
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
