/**
 * AWS Bedrock Agents adapter for Sanctum Runtime.
 *
 * Bedrock Agents invoke "action groups" — each group is a Lambda or OpenAPI
 * schema. The Lambda receives an `apiPath`, `httpMethod`, and `parameters`
 * payload. Drop the gate at the very top of the Lambda handler so Sanctum
 * approves the action before the side effect runs.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type BedrockAgentEvent = {
  agent: { name: string; id: string; alias?: string; version?: string }
  actionGroup: string
  apiPath?: string
  httpMethod?: string
  parameters?: Array<{ name: string; type?: string; value: unknown }>
  inputText?: string
  sessionId?: string
  sessionAttributes?: Record<string, string>
  promptSessionAttributes?: Record<string, string>
}

function paramsToObject(params: BedrockAgentEvent['parameters']): Record<string, unknown> {
  if (!params) return {}
  return Object.fromEntries(params.map((p) => [p.name, p.value]))
}

/**
 * Gate a Bedrock Agents action-group Lambda invocation.
 *
 * @example
 * ```ts
 * export const handler = async (event: BedrockAgentEvent) => {
 *   await gateBedrockAgentEvent(event, { client, agentId: event.agent.id })
 *   return dispatchActionGroup(event)
 * }
 * ```
 */
export async function gateBedrockAgentEvent(
  event: BedrockAgentEvent,
  options: SanctumAdapterOptions,
): Promise<void> {
  const action = event.apiPath
    ? `${event.actionGroup}:${event.httpMethod ?? 'POST'} ${event.apiPath}`
    : event.actionGroup
  await gate(
    {
      action,
      params: paramsToObject(event.parameters),
      actor: options.agentId ?? `bedrock:${event.agent.name}`,
      context: {
        sessionId: event.sessionId,
        agentAlias: event.agent.alias,
        agentVersion: event.agent.version,
      },
    },
    {
      ...options,
      correlationId: event.sessionId ?? options.correlationId,
    },
  )
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
