/**
 * n8n / Zapier / Make workflow-automation adapter for Sanctum Runtime.
 *
 * Enterprise workflow tools fire HTTP callbacks at each step. The recommended
 * integration is to drop a "Sanctum Gate" HTTP node before any side-effect
 * step (send email, create row, post Slack, transfer funds). This adapter
 * exposes the gate logic so a Function / Code node in n8n can `await gate(...)`
 * inline.
 *
 * Works equally well with Zapier "Code by Zapier" actions and Make.com
 * Custom Apps — anywhere you can run an async JS function with fetch.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

export type N8nStepInput = {
  /** Step name — e.g. "send_invoice_email". Becomes the Sanctum action. */
  step: string
  /** Step parameters — Sanctum sees these as context.params. */
  params: Record<string, unknown>
  /** Workflow id / run id — threaded through as correlationId for the chain. */
  workflowId?: string
  /** Source of the triggering event (webhook / cron / manual / chained). */
  triggerSource?: string
}

/**
 * Gate an n8n / Zapier / Make workflow step. Throws SanctumBlockedError to
 * abort the workflow when policy or operator denies the action.
 *
 * @example n8n "Code" node:
 * ```js
 * import { gateN8nStep } from '@sanctum-runtime/adapters'
 * await gateN8nStep(
 *   { step: 'transfer_funds', params: $input.all()[0].json, workflowId: $workflow.id },
 *   { client, agentId: 'n8n:' + $workflow.name },
 * )
 * return $input.all()
 * ```
 */
export async function gateN8nStep(
  input: N8nStepInput,
  options: SanctumAdapterOptions,
): Promise<void> {
  await gate(
    {
      action: input.step,
      params: input.params,
      actor: options.agentId ?? 'n8n-workflow',
      context: {
        instructionSource: input.triggerSource ?? 'workflow',
        workflowId: input.workflowId,
      },
    },
    {
      ...options,
      correlationId: input.workflowId ?? options.correlationId,
    },
  )
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
