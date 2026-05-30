/**
 * Wire governance workflows into Connect / proxy verify holds.
 */
import type { SupabaseAuthConfig } from './auth.js'
import { findWorkflow, createPendingApproval } from './governance.js'
import type { ActionResult } from '@sanctum-runtime/sdk'

export async function maybeCreateConnectWorkflowApproval(
  cfg: SupabaseAuthConfig,
  opts: {
    orgId: string
    action: string
    actor: string
    context: Record<string, unknown>
    auditEntry: ActionResult
  },
): Promise<{ workflowId: string; pendingApprovalId: string } | null> {
  if (opts.context.proxy !== true) return null
  if (opts.auditEntry.decision !== 'REQUIRE_VERIFICATION') return null

  const workflow = await findWorkflow(cfg, opts.orgId, opts.action)
  if (!workflow) return null

  const pending = await createPendingApproval(cfg, {
    orgId: opts.orgId,
    workflowId: workflow.id,
    action: opts.action,
    params: (opts.context.arguments as Record<string, unknown>) ?? {},
    actor: opts.actor,
    context: { ...opts.context, audit_entry_id: opts.auditEntry.id },
    auditEventId: opts.auditEntry.id,
  })

  return { workflowId: workflow.id, pendingApprovalId: pending.id }
}
