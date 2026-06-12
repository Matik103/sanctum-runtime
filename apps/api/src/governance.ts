/**
 * Governance module: multi-step approval workflow engine.
 *
 * Provides workflow configuration management, pending approval lifecycle
 * (create → decide → expire/escalate), and Fastify route registration.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { logger as rootLogger } from './logger.js'
import { getEntitlementEngine } from './entitlements.js'
import { canUseGovernanceWorkflows, sendPlanFeatureRequired } from './entitlements-gate.js'

const log = rootLogger.child({ module: 'governance' })

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStep = {
  role: 'owner' | 'admin' | 'member'
  required_count: number
}

export type WorkflowConfig = {
  id: string
  org_id: string
  name: string
  description?: string
  action_pattern: string
  steps: ApprovalStep[]
  expiry_minutes: number
  escalation_after_minutes?: number
  escalation_role?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ApprovalRecord = {
  user_id: string
  role: string
  decision: 'approve' | 'reject'
  note?: string
  timestamp: string
}

export type PendingApproval = {
  id: string
  org_id: string
  audit_event_id?: string
  workflow_id?: string
  action: string
  params: Record<string, unknown>
  actor?: string
  context: Record<string, unknown>
  current_step: number
  approvals: ApprovalRecord[]
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated'
  expires_at: string
  escalated_at?: string
  final_decision?: 'APPROVED' | 'BLOCKED'
  created_at: string
  updated_at: string
}

// ─── Pattern matching ─────────────────────────────────────────────────────────

/**
 * Match an action string against a glob pattern.
 * `*`  matches any characters except `.`
 * `**` matches any characters including `.`
 */
export function matchesPattern(action: string, pattern: string): boolean {
  // Escape all regex special chars except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  // Replace ** before * to avoid double-processing
  const regexStr = escaped
    .replace(/\*\*/g, '\x00') // placeholder for **
    .replace(/\*/g, '[^.]*')  // * → any chars except dot
    .split('\x00').join('.*') // ** → any chars including dot
    .replace(/\?/g, '.')
  const re = new RegExp(`^${regexStr}$`)
  return re.test(action)
}

// ─── Core workflow functions ──────────────────────────────────────────────────

/**
 * Find the first active workflow whose action_pattern matches the given action.
 * Workflows are checked in order of creation (oldest first as tie-breaker).
 */
export async function findWorkflow(
  cfg: SupabaseAuthConfig,
  orgId: string,
  action: string,
): Promise<WorkflowConfig | null> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('approval_workflows')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error || !data) return null

  for (const row of data) {
    if (matchesPattern(action, row.action_pattern as string)) {
      return rowToWorkflow(row)
    }
  }
  return null
}

/**
 * Create a pending approval request, optionally tied to a workflow.
 */
export async function createPendingApproval(
  cfg: SupabaseAuthConfig,
  params: {
    orgId: string
    workflowId?: string
    action: string
    params: Record<string, unknown>
    actor?: string
    context: Record<string, unknown>
    auditEventId?: string
  },
): Promise<PendingApproval> {
  const admin = createSupabaseAdmin(cfg)

  // Determine expiry from the associated workflow (default 60 min)
  let expiryMinutes = 60
  if (params.workflowId) {
    const { data: wf } = await admin
      .from('approval_workflows')
      .select('expiry_minutes')
      .eq('id', params.workflowId)
      .maybeSingle()
    if (wf?.expiry_minutes) expiryMinutes = wf.expiry_minutes as number
  }

  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

  const insert = {
    org_id: params.orgId,
    workflow_id: params.workflowId ?? null,
    audit_event_id: params.auditEventId ?? null,
    action: params.action,
    params: params.params,
    actor: params.actor ?? null,
    context: params.context,
    current_step: 0,
    approvals: [],
    status: 'pending',
    expires_at: expiresAt,
  }

  const { data, error } = await admin
    .from('pending_approvals')
    .insert(insert)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create pending approval: ${error?.message ?? 'unknown error'}`)
  }
  return rowToApproval(data)
}

/**
 * Submit an approval or rejection decision from an authenticated user.
 *
 * Rules:
 * - Cannot vote on an already-decided approval
 * - Each user may only vote once per approval
 * - Once required_count approvals are met for the current step, the step advances
 * - A single rejection from a step participant immediately rejects the whole approval
 * - When all steps pass, final_decision is set to APPROVED
 */
export async function submitApproval(
  cfg: SupabaseAuthConfig,
  approvalId: string,
  userId: string,
  userRole: string,
  decision: 'approve' | 'reject',
  note?: string,
): Promise<PendingApproval> {
  const admin = createSupabaseAdmin(cfg)

  const { data: row, error: fetchErr } = await admin
    .from('pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .single()

  if (fetchErr || !row) {
    throw new Error(`Pending approval not found: ${approvalId}`)
  }

  const approval = rowToApproval(row)

  if (approval.status !== 'pending' && approval.status !== 'escalated') {
    throw new Error(`Approval is already ${approval.status}`)
  }
  if (new Date(approval.expires_at) < new Date()) {
    throw new Error('Approval has expired')
  }

  // Prevent duplicate votes
  const alreadyVoted = approval.approvals.some((a) => a.user_id === userId)
  if (alreadyVoted) {
    throw new Error('You have already submitted a decision for this approval')
  }

  const newRecord: ApprovalRecord = {
    user_id: userId,
    role: userRole,
    decision,
    note,
    timestamp: new Date().toISOString(),
  }

  const updatedApprovals = [...approval.approvals, newRecord]

  // Immediate rejection
  if (decision === 'reject') {
    const { data: updated, error: upErr } = await admin
      .from('pending_approvals')
      .update({
        approvals: updatedApprovals,
        status: 'rejected',
        final_decision: 'BLOCKED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .select('*')
      .single()

    if (upErr || !updated) throw new Error(`Failed to update approval: ${upErr?.message}`)
    return rowToApproval(updated)
  }

  // Approval path — evaluate step advancement
  let currentStep = approval.current_step
  let newStatus: PendingApproval['status'] = 'pending'
  let finalDecision: 'APPROVED' | 'BLOCKED' | undefined

  // Load workflow steps if we have a workflow
  let steps: ApprovalStep[] = []
  if (approval.workflow_id) {
    const { data: wf } = await admin
      .from('approval_workflows')
      .select('steps')
      .eq('id', approval.workflow_id)
      .maybeSingle()
    if (wf?.steps) steps = wf.steps as ApprovalStep[]
  }

  if (steps.length > 0) {
    const step = steps[currentStep]
    if (step) {
      // Count approvals for the current step (by role)
      const stepApprovals = updatedApprovals.filter(
        (a) => a.decision === 'approve' && a.role === step.role,
      )
      if (stepApprovals.length >= step.required_count) {
        currentStep += 1
        if (currentStep >= steps.length) {
          newStatus = 'approved'
          finalDecision = 'APPROVED'
        }
        // else: still more steps — remain 'pending' but current_step advances
      }
    }
  } else {
    // No workflow steps — single approve is sufficient
    newStatus = 'approved'
    finalDecision = 'APPROVED'
  }

  const { data: updated, error: upErr } = await admin
    .from('pending_approvals')
    .update({
      approvals: updatedApprovals,
      current_step: currentStep,
      status: newStatus,
      ...(finalDecision ? { final_decision: finalDecision } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', approvalId)
    .select('*')
    .single()

  if (upErr || !updated) throw new Error(`Failed to update approval: ${upErr?.message}`)
  return rowToApproval(updated)
}

/**
 * Check whether a pending approval has reached a final decision.
 */
export async function checkApprovalStatus(
  cfg: SupabaseAuthConfig,
  approvalId: string,
): Promise<{ done: boolean; decision?: 'APPROVED' | 'BLOCKED' }> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('pending_approvals')
    .select('status,final_decision')
    .eq('id', approvalId)
    .maybeSingle()

  if (error || !data) return { done: false }

  const status = data.status as string
  const finalDecision = data.final_decision as 'APPROVED' | 'BLOCKED' | null

  if (status === 'approved' || status === 'rejected' || status === 'expired') {
    return { done: true, decision: finalDecision ?? (status === 'rejected' ? 'BLOCKED' : undefined) }
  }
  return { done: false }
}

/**
 * Mark all pending approvals whose expires_at has passed as 'expired'.
 * Returns the number of rows updated.
 * Designed to be called by a periodic cron/setInterval.
 */
export async function expireStaleApprovals(cfg: SupabaseAuthConfig): Promise<number> {
  const admin = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('pending_approvals')
    .update({
      status: 'expired',
      final_decision: 'BLOCKED',
      updated_at: now,
    })
    .eq('status', 'pending')
    .lt('expires_at', now)
    .select('id')

  if (error) {
    log.error({ error: error.message }, 'expireStaleApprovals failed')
    return 0
  }
  return data?.length ?? 0
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const approvalStepSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
  required_count: z.number().int().min(1),
})

const workflowCreateSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1000).optional(),
  action_pattern: z.string().min(1).max(256),
  steps: z.array(approvalStepSchema).min(1),
  expiry_minutes: z.number().int().min(1).max(10080).default(60), // max 1 week
  escalation_after_minutes: z.number().int().min(1).optional(),
  escalation_role: z.enum(['owner', 'admin', 'member']).optional(),
  is_active: z.boolean().default(true),
})

const workflowPatchSchema = workflowCreateSchema.partial()

const decideSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(1000).optional(),
})

// ─── Fastify routes ───────────────────────────────────────────────────────────

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

/**
 * Register all governance routes on the Fastify app.
 *
 * Routes:
 *   GET    /v1/orgs/:orgId/workflows
 *   POST   /v1/orgs/:orgId/workflows
 *   PATCH  /v1/orgs/:orgId/workflows/:workflowId
 *   DELETE /v1/orgs/:orgId/workflows/:workflowId
 *   GET    /v1/orgs/:orgId/approvals?status=pending
 *   GET    /v1/orgs/:orgId/approvals/:approvalId
 *   POST   /v1/orgs/:orgId/approvals/:approvalId/decide
 */
export async function registerGovernanceRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
  runtime: import('@sanctum/runtime-engine').RuntimeEngine,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  async function requireGovernancePlan(orgId: string, reply: import('fastify').FastifyReply): Promise<boolean> {
    const limits = await entitlements.getLimits(orgId)
    if (canUseGovernanceWorkflows(limits)) return true
    sendPlanFeatureRequired(reply, limits, 'holds_approve', 'Approval workflows require Operator or higher.')
    return false
  }

  // ── Authorization helpers ──────────────────────────────────────────────────

  async function resolveOrgAccess(
    req: SanctumReq,
    orgId: string,
  ): Promise<{ allowed: boolean; userId?: string; userRole?: string }> {
    if (req.sanctumUser) {
      const orgs = await store.getUserOrgIds(req.sanctumUser.id)
      if (!orgs.includes(orgId)) return { allowed: false }

      // Fetch the user's role in this org
      const { data: member } = await admin
        .from('organization_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', req.sanctumUser.id)
        .maybeSingle()

      return {
        allowed: true,
        userId: req.sanctumUser.id,
        userRole: (member?.role as string | undefined) ?? 'member',
      }
    }

    if (req.sanctumApiKeyScope !== undefined) {
      if (!req.sanctumApiKeyScope.includes(orgId)) return { allowed: false }
      return { allowed: true, userRole: 'admin' }
    }

    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg !== orgId) return { allowed: false }
      return { allowed: true, userRole: 'admin' } // API keys treated as admin
    }

    return { allowed: false }
  }

  async function requireAdmin(
    req: SanctumReq,
    orgId: string,
  ): Promise<{ ok: boolean; userId?: string; userRole?: string }> {
    const access = await resolveOrgAccess(req, orgId)
    if (!access.allowed) return { ok: false }
    if (access.userRole !== 'owner' && access.userRole !== 'admin') return { ok: false }
    return { ok: true, ...access }
  }

  // ── Workflow CRUD ──────────────────────────────────────────────────────────

  // GET /v1/orgs/:orgId/workflows
  app.get('/v1/orgs/:orgId/workflows', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })

    const { data, error } = await admin
      .from('approval_workflows')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })

    if (error) return reply.status(500).send({ error: 'fetch_failed', detail: error.message })
    return (data ?? []).map(rowToWorkflow)
  })

  // POST /v1/orgs/:orgId/workflows
  app.post('/v1/orgs/:orgId/workflows', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await requireAdmin(req as SanctumReq, orgId)
    if (!access.ok) return reply.status(403).send({ error: 'admin_required' })
    if (!(await requireGovernancePlan(orgId, reply))) return

    const body = workflowCreateSchema.parse(req.body)
    const now = new Date().toISOString()

    const { data, error } = await admin
      .from('approval_workflows')
      .insert({ ...body, org_id: orgId, created_at: now, updated_at: now })
      .select('*')
      .single()

    if (error || !data) return reply.status(500).send({ error: 'create_failed', detail: error?.message })
    return reply.status(201).send(rowToWorkflow(data))
  })

  // PATCH /v1/orgs/:orgId/workflows/:workflowId
  app.patch('/v1/orgs/:orgId/workflows/:workflowId', async (req, reply) => {
    const { orgId, workflowId } = req.params as { orgId: string; workflowId: string }
    const access = await requireAdmin(req as SanctumReq, orgId)
    if (!access.ok) return reply.status(403).send({ error: 'admin_required' })
    if (!(await requireGovernancePlan(orgId, reply))) return

    const body = workflowPatchSchema.parse(req.body)

    const { data, error } = await admin
      .from('approval_workflows')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', workflowId)
      .eq('org_id', orgId)
      .select('*')
      .single()

    if (error) return reply.status(500).send({ error: 'update_failed', detail: error.message })
    if (!data) return reply.status(404).send({ error: 'workflow_not_found' })
    return rowToWorkflow(data)
  })

  // DELETE /v1/orgs/:orgId/workflows/:workflowId
  app.delete('/v1/orgs/:orgId/workflows/:workflowId', async (req, reply) => {
    const { orgId, workflowId } = req.params as { orgId: string; workflowId: string }
    const access = await requireAdmin(req as SanctumReq, orgId)
    if (!access.ok) return reply.status(403).send({ error: 'admin_required' })
    if (!(await requireGovernancePlan(orgId, reply))) return

    const { error, count } = await admin
      .from('approval_workflows')
      .delete({ count: 'exact' })
      .eq('id', workflowId)
      .eq('org_id', orgId)

    if (error) return reply.status(500).send({ error: 'delete_failed', detail: error.message })
    if (!count) return reply.status(404).send({ error: 'workflow_not_found' })
    return reply.status(204).send()
  })

  // ── Approvals ──────────────────────────────────────────────────────────────

  // GET /v1/orgs/:orgId/approvals?status=pending
  app.get('/v1/orgs/:orgId/approvals', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })

    const q = req.query as { status?: string; limit?: string }
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50) || 50))

    let query = admin
      .from('pending_approvals')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (q.status) {
      query = query.eq('status', q.status)
    }

    const { data, error } = await query
    if (error) return reply.status(500).send({ error: 'fetch_failed', detail: error.message })
    return (data ?? []).map(rowToApproval)
  })

  // GET /v1/orgs/:orgId/approvals/:approvalId
  app.get('/v1/orgs/:orgId/approvals/:approvalId', async (req, reply) => {
    const { orgId, approvalId } = req.params as { orgId: string; approvalId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })

    const { data, error } = await admin
      .from('pending_approvals')
      .select('*')
      .eq('id', approvalId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) return reply.status(500).send({ error: 'fetch_failed', detail: error.message })
    if (!data) return reply.status(404).send({ error: 'approval_not_found' })
    return rowToApproval(data)
  })

  // POST /v1/orgs/:orgId/approvals/:approvalId/decide
  app.post('/v1/orgs/:orgId/approvals/:approvalId/decide', async (req, reply) => {
    const { orgId, approvalId } = req.params as { orgId: string; approvalId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })
    if (!access.userId) {
      return reply.status(403).send({ error: 'user_identity_required', hint: 'Use Bearer JWT to decide approvals' })
    }
    if (!(await requireGovernancePlan(orgId, reply))) return

    const body = decideSchema.parse(req.body)

    try {
      const updated = await submitApproval(
        cfg,
        approvalId,
        access.userId,
        access.userRole ?? 'member',
        body.decision,
        body.note,
      )

      // Release held Connect / verify actions when governance workflow completes.
      if (
        updated.audit_event_id &&
        (updated.status === 'approved' || updated.status === 'rejected')
      ) {
        const auditDecision = updated.status === 'approved' ? 'APPROVED' : 'BLOCKED'
        await runtime.resolveAuditEntry(updated.audit_event_id, {
          decision: auditDecision,
          resolvedBy: access.userId,
          note: body.note ?? `Governance workflow ${updated.status}`,
        })
      }

      return updated
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(400).send({ error: 'decision_failed', detail: msg })
    }
  })
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToWorkflow(row: Record<string, unknown>): WorkflowConfig {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    action_pattern: row.action_pattern as string,
    steps: (row.steps ?? []) as ApprovalStep[],
    expiry_minutes: row.expiry_minutes as number,
    escalation_after_minutes: row.escalation_after_minutes as number | undefined,
    escalation_role: row.escalation_role as string | undefined,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function rowToApproval(row: Record<string, unknown>): PendingApproval {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    audit_event_id: row.audit_event_id as string | undefined,
    workflow_id: row.workflow_id as string | undefined,
    action: row.action as string,
    params: (row.params ?? {}) as Record<string, unknown>,
    actor: row.actor as string | undefined,
    context: (row.context ?? {}) as Record<string, unknown>,
    current_step: row.current_step as number,
    approvals: (row.approvals ?? []) as ApprovalRecord[],
    status: row.status as PendingApproval['status'],
    expires_at: row.expires_at as string,
    escalated_at: row.escalated_at as string | undefined,
    final_decision: row.final_decision as 'APPROVED' | 'BLOCKED' | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}
