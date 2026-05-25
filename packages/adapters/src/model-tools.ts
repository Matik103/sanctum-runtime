/**
 * Provider-neutral tool-call adapter for model APIs and hosted agent runners.
 *
 * OpenAI, Anthropic, Google Gemini, xAI Grok, DeepSeek, NVIDIA NIM and
 * OpenAI-compatible endpoints all eventually dispatch a named tool with JSON
 * arguments. Gate that dispatch point and the model vendor no longer matters.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'xai-grok'
  | 'deepseek'
  | 'nvidia-nim'
  | 'aws-bedrock'
  | 'azure-openai'
  | 'mistral'
  | 'cohere'
  | 'local'
  | 'custom'

export type ModelToolCall = {
  name: string
  arguments?: Record<string, unknown>
  callId?: string
}

export type ModelToolOptions = SanctumAdapterOptions & {
  provider: ModelProvider
  model?: string
  instructionSource?: string
}

/**
 * Verify one provider tool call before its executor receives any arguments.
 */
export async function gateModelToolCall(
  call: ModelToolCall,
  options: ModelToolOptions,
) {
  return gate(
    {
      action: call.name,
      params: call.arguments,
      actor: options.agentId,
      context: {
        provider: options.provider,
        ...(options.model ? { model: options.model } : {}),
        ...(call.callId ? { toolCallId: call.callId } : {}),
        instructionSource: options.instructionSource ?? 'user',
      },
    },
    options,
  )
}

/**
 * Wrap the common "execute a named tool call" boundary used by hosted model
 * APIs. The original executor only runs after Sanctum approves the action.
 */
export function wrapModelToolExecutor<T>(
  execute: (call: ModelToolCall) => Promise<T>,
  options: ModelToolOptions,
): (call: ModelToolCall) => Promise<T> {
  return async (call) => {
    await gateModelToolCall(call, options)
    return execute(call)
  }
}
