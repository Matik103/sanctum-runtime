import { ConnectClient, ConnectExecutionBlocked, type ConnectClientOptions } from './client.js'

export type OpenAiToolCall = {
  id: string
  function: { name: string; arguments: string }
}

export function wrapToolExecutor<T>(
  execute: (call: OpenAiToolCall) => Promise<T>,
  options: ConnectClientOptions,
): (call: OpenAiToolCall) => Promise<T> {
  const client = new ConnectClient(options)
  return async (call) => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
    } catch {
      args = { raw: call.function.arguments }
    }
    await client.verifyExecution(call.function.name, args, call.id)
    return execute(call)
  }
}

/** Run tool calls locally only after Connect verify-execution approves each one. */
export async function runGatedToolCalls<T>(
  toolCalls: OpenAiToolCall[],
  executors: Record<string, (args: Record<string, unknown>) => Promise<T>>,
  options: ConnectClientOptions,
): Promise<Array<{ id: string; result: T }>> {
  const client = new ConnectClient(options)
  const out: Array<{ id: string; result: T }> = []
  for (const call of toolCalls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
    } catch {
      args = {}
    }
    const verdict = await client.verifyExecution(call.function.name, args, call.id)
    if (verdict.decision !== 'APPROVED') {
      throw new ConnectExecutionBlocked(`Tool ${call.function.name} not approved`, verdict.decision, verdict.entry)
    }
    const fn = executors[call.function.name]
    if (!fn) throw new Error(`No executor registered for ${call.function.name}`)
    out.push({ id: call.id, result: await fn(args) })
  }
  return out
}
