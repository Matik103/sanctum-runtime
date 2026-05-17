/**
 * Client-side delegation context helpers.
 *
 * These utilities run entirely in the SDK (browser or Node) with no server
 * calls required. They let callers annotate ActionRequests with delegation
 * metadata before sending them to the Sanctum API.
 */
import type { ActionRequest } from './types.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DelegationContext = {
  /** The immediate parent agent that granted this delegation. */
  parentAgentId?: string
  /**
   * Full ordered chain from root to the acting agent.
   * Built with `buildDelegationChain`.
   */
  delegationChain?: string[]
  /** ID of the human user who originally authorised the delegation grant. */
  grantedByUserId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an ordered delegation chain string from root parent(s) to the acting agent.
 *
 * @param agentId   - The agent that is about to perform an action (leaf).
 * @param parentIds - Zero or more ancestor agent IDs ordered from root → parent.
 *
 * @example
 * buildDelegationChain('agent-c', 'root-agent', 'agent-b')
 * // → ['root-agent', 'agent-b', 'agent-c']
 *
 * buildDelegationChain('solo-agent')
 * // → ['solo-agent']
 */
export function buildDelegationChain(agentId: string, ...parentIds: string[]): string[] {
  const seen = new Set<string>()
  const chain: string[] = []
  for (const id of [...parentIds, agentId]) {
    if (!seen.has(id)) {
      seen.add(id)
      chain.push(id)
    }
  }
  return chain
}

/**
 * Merge delegation context into an ActionRequest's `context` map.
 *
 * The delegation metadata is stored under well-known keys so the Sanctum
 * API can read and audit-log it without altering the core `actor`/`action`
 * fields.
 *
 * @param action     - The original ActionRequest to enrich.
 * @param delegation - Delegation context to merge in.
 * @returns A new ActionRequest with delegation fields added to `context`.
 */
export function enrichActionWithDelegation(
  action: ActionRequest,
  delegation: DelegationContext,
): ActionRequest {
  const existingContext = action.context ?? {}

  const delegationFields: Record<string, unknown> = {}

  if (delegation.parentAgentId !== undefined) {
    delegationFields['delegation_parent_agent_id'] = delegation.parentAgentId
  }
  if (delegation.delegationChain !== undefined && delegation.delegationChain.length > 0) {
    delegationFields['delegation_chain'] = delegation.delegationChain
    delegationFields['delegation_depth'] = delegation.delegationChain.length
  }
  if (delegation.grantedByUserId !== undefined) {
    delegationFields['delegation_granted_by_user_id'] = delegation.grantedByUserId
  }

  return {
    ...action,
    context: {
      ...existingContext,
      ...delegationFields,
    },
  }
}
