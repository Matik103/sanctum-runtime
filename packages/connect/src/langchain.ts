import { ConnectClient, ConnectExecutionBlocked, type ConnectClientOptions } from './client.js'

export type LangChainToolLike = {
  name: string
  description?: string
  func: (input: unknown, ...rest: unknown[]) => Promise<unknown>
  [key: string]: unknown
}

export function wrapLangChainTool(
  tool: LangChainToolLike,
  options: ConnectClientOptions,
): LangChainToolLike {
  const client = new ConnectClient(options)
  const original = tool.func
  return {
    ...tool,
    func: async (input: unknown, ...rest: unknown[]) => {
      const args =
        input != null && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : { input }
      try {
        await client.verifyExecution(tool.name, args)
      } catch (err) {
        if (err instanceof ConnectExecutionBlocked) throw err
        throw err
      }
      return original(input, ...rest)
    },
  }
}

export function createSanctumTools(
  tools: LangChainToolLike[],
  options: ConnectClientOptions,
): LangChainToolLike[] {
  return tools.map((t) => wrapLangChainTool(t, options))
}
