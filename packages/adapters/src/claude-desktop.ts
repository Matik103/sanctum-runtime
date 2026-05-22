/**
 * Claude Desktop / computer-use adapter for Sanctum Runtime.
 *
 * Claude's computer-use API exposes tool calls like `bash`, `computer`
 * (screenshot / mouse / keyboard), `text_editor`, and arbitrary HTTP tools.
 * Each comes through as a tool_use block on the model output.
 *
 * The adapter takes a tool_use block and runs it through Sanctum before
 * the orchestrator dispatches it to its handler. instructionSource defaults
 * to "tool_output" because the model's reasoning may have been steered by
 * a previous tool result (web content, doc, screenshot OCR).
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

/**
 * Anthropic tool_use block (subset). The orchestrator receives one of these
 * per tool the model wants to invoke.
 */
export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Run a Claude tool_use block through Sanctum. Throws SanctumBlockedError
 * if the action is denied; returns silently on APPROVED.
 *
 * The `name` becomes the Sanctum action — namespace it (e.g. "desktop:bash",
 * "desktop:computer.screenshot") so policies can target sub-actions.
 *
 * @example
 * ```ts
 * for (const block of response.content) {
 *   if (block.type === 'tool_use') {
 *     await gateClaudeToolUse(block, { client, agentId: 'claude-desktop:user-42' })
 *     const result = await dispatchTool(block)
 *     // …feed result back to Claude
 *   }
 * }
 * ```
 */
export async function gateClaudeToolUse(
  block: ToolUseBlock,
  options: SanctumAdapterOptions & { instructionSource?: string },
): Promise<void> {
  await gate(
    {
      action: block.name,
      params: block.input,
      actor: options.agentId ?? 'claude-desktop',
      context: { instructionSource: options.instructionSource ?? 'tool_output', toolUseId: block.id },
    },
    options,
  )
}

/**
 * Wrap a dispatcher function (`(block) => Promise<result>`) with a Sanctum
 * gate. Useful when the orchestrator has a single fan-out point.
 */
export function wrapClaudeDispatcher<T>(
  dispatch: (block: ToolUseBlock) => Promise<T>,
  options: SanctumAdapterOptions & { instructionSource?: string },
): (block: ToolUseBlock) => Promise<T> {
  return async (block) => {
    await gateClaudeToolUse(block, options)
    return dispatch(block)
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
