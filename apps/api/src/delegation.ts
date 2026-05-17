/**
 * Multi-agent trust chain validation.
 *
 * Stores delegation grants in the `agent_delegations` table and provides
 * helpers to validate whether a child agent is authorised to perform an
 * action on behalf of its parent.
 */
import type { FastifyInstance } from 'fastify'
import type { SupabaseAuthConfig } from './auth.js'
import { authenticateRequest, createSupabaseAdmin } from './auth.js'
import { assertOrgRole } from './rbac.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DelegationContext = {
  parentAgentId: string
  childAgentId: string
  grantedActions?: string[] // empty array means all actions are allowed
  context?: Record<string, unknown>
}

export type DelegationGrant = DelegationContext & {
  id: string
  org_id: string
  expires_at?: string
  revoked_at?: string
  created_at: string
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Check whether `childAgentId` has an active, non-expired delegation grant
 * from `parentAgentId` that covers `action`.
 *
 * A grant is considered to cover an action when either:
 *  - granted_actions is empty (wildcard — all actions allowed), or
 *  - the action appears verbatim in granted_actions.
 */
export async function validateDelegation(
  cfg: SupabaseAuthConfig,
  orgId: string,
  parentAgentId: string,
  childAgentId: string,
  action: string,
): Promise<{ valid: boolean; reason?: string }> {
  const admin = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('agent_delegations')
    .select('id, granted_actions, expires_at, revoked_at')
    .eq('org_id', orgId)
    .eq('parent_agent_id', parentAgentId)
    .eq('child_agent_id', childAgentId)
    .is('revoked_at', null)

  if (error) {
    return { valid: false, reason: `Database error: ${error.message}` }
  }

  if (!data || data.length === 0) {
    return {
      valid: false,
      reason: `No delegation grant found from "${parentAgentId}" to "${childAgentId}"`,
    }
  }

  for (const grant of data) {
    // Check expiry
    if (grant.expires_at && (grant.expires_at as string) < now) {
      continue // expired — check other grants
    }

    const grantedActions = (grant.granted_actions ?? []) as string[]

    // Empty granted_actions = wildcard (all actions)
    if (grantedActions.length === 0) {
      return { valid: true }
    }

    if (grantedActions.includes(action)) {
      return { valid: true }
    }
  }

  return {
    valid: false,
    reason: `Action "${action}" is not covered by any active delegation grant from "${parentAgentId}" to "${childAgentId}"`,
  }
}

// ─── Grant management ─────────────────────────────────────────────────────────

/**
 * Persist a new delegation grant. Returns the newly created delegation ID.
 */
export async function grantDelegation(
  cfg: SupabaseAuthConfig,
  orgId: string,
  delegation: DelegationContext & { expiresAt?: Date },
): Promise<string> {
  const admin = createSupabaseAdmin(cfg)

  const insert = {
    org_id: orgId,
    parent_agent_id: delegation.parentAgentId,
    child_agent_id: delegation.childAgentId,
    granted_actions: delegation.grantedActions ?? [],
    context: delegation.context ?? {},
    expires_at: delegation.expiresAt?.toISOString() ?? null,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from('agent_delegations')
    .insert(insert)
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to grant delegation: ${error?.message ?? 'unknown error'}`)
  }

  return data.id as string
}

/**
 * Soft-delete a delegation grant by setting revoked_at to now.
 * Verifies the grant belongs to the specified org before revoking.
 */
export async function revokeDelegation(
  cfg: SupabaseAuthConfig,
  delegationId: string,
  orgId: string,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)

  const { error, count } = await admin
    .from('agent_delegations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', delegationId)
    .eq('org_id', orgId)
    .is('revoked_at', null)

  if (error) {
    throw new Error(`Failed to revoke delegation: ${error.message}`)
  }
  if (!count) {
    throw new Error(`Delegation "${delegationId}" not found or already revoked`)
  }
}

// ─── Chain helpers ────────────────────────────────────────────────────────────

/**
 * Build an ordered delegation chain from root (first parent) to leaf (agentId).
 * Useful for audit logging — call with the immediate agent and its ancestry.
 *
 * Example:
 *   buildDelegationChain('agent-c', 'root-agent', 'agent-b')
 *   → ['root-agent', 'agent-b', 'agent-c']
 */
export function buildDelegationChain(agentId: string, ...parentIds: string[]): string[] {
  // Deduplicate while preserving order, then append the leaf agent
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
 * Enrich an ActionResult (or any audit object) with delegation chain metadata.
 * The chain is written into the `context.delegation_chain` field so it is
 * preserved in audit logs without altering the core decision fields.
 */
export function enrichAuditWithDelegation(
  result: unknown,
  chain: string[],
): unknown {
  if (typeof result !== 'object' || result === null) return result

  const r = result as Record<string, unknown>
  const existingContext =
    typeof r.context === 'object' && r.context !== null
      ? (r.context as Record<string, unknown>)
      : {}

  return {
    ...r,
    context: {
      ...existingContext,
      delegation_chain: chain,
      delegation_depth: chain.length,
    },
  }
}

// ─── HTTP Routes ──────────────────────────────────────────────────────────────

export function registerDelegationRoutes(app: FastifyInstance, cfg: SupabaseAuthConfig) {
  // List active delegation grants for an org
  app.get('/v1/orgs/:orgId/delegations', async (req, reply) => {
    const user = await authenticateRequest(req, cfg)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })
    const { orgId } = req.params as { orgId: string }
    await assertOrgRole(cfg, orgId, user.id, 'member')

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('agent_delegations')
      .select('*')
      .eq('org_id', orgId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })
    return reply.send(data ?? [])
  })

  // Grant a new delegation
  app.post('/v1/orgs/:orgId/delegations', async (req, reply) => {
    const user = await authenticateRequest(req, cfg)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })
    const { orgId } = req.params as { orgId: string }
    await assertOrgRole(cfg, orgId, user.id, 'admin')

    const body = req.body as {
      parentAgentId: string
      childAgentId: string
      grantedActions?: string[]
      expiresAt?: string
    }
    if (!body.parentAgentId || !body.childAgentId) {
      return reply.status(400).send({ error: 'parentAgentId and childAgentId are required' })
    }

    const id = await grantDelegation(cfg, orgId, {
      parentAgentId: body.parentAgentId,
      childAgentId: body.childAgentId,
      grantedActions: body.grantedActions,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    })
    return reply.status(201).send({ id })
  })

  // Revoke a delegation grant
  app.delete('/v1/orgs/:orgId/delegations/:delegationId', async (req, reply) => {
    const user = await authenticateRequest(req, cfg)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })
    const { orgId, delegationId } = req.params as { orgId: string; delegationId: string }
    await assertOrgRole(cfg, orgId, user.id, 'admin')

    await revokeDelegation(cfg, delegationId, orgId)
    return reply.status(204).send()
  })

  // Validate whether a child agent may act on behalf of a parent for a given action
  app.post('/v1/orgs/:orgId/delegations/validate', async (req, reply) => {
    const user = await authenticateRequest(req, cfg)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })
    const { orgId } = req.params as { orgId: string }
    await assertOrgRole(cfg, orgId, user.id, 'member')

    const body = req.body as {
      parentAgentId: string
      childAgentId: string
      action: string
    }
    if (!body.parentAgentId || !body.childAgentId || !body.action) {
      return reply.status(400).send({ error: 'parentAgentId, childAgentId and action are required' })
    }

    const result = await validateDelegation(cfg, orgId, body.parentAgentId, body.childAgentId, body.action)
    return reply.send(result)
  })
}
