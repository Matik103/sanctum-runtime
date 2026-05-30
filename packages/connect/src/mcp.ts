import { ConnectClient, type ConnectClientOptions } from './client.js'

/** MCP hook using Connect verify-execution (no SDK). */
export function createConnectMcpHook(options: ConnectClientOptions): {
  beforeToolCall: (toolName: string, args: Record<string, unknown>) => Promise<void>
} {
  const client = new ConnectClient({ ...options, platform: options.platform ?? 'mcp' })
  return {
    async beforeToolCall(toolName, args) {
      await client.verifyExecution(toolName, args, `mcp-${toolName}-${Date.now()}`)
    },
  }
}
