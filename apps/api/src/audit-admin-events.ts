import { randomUUID } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { chainFieldsForNewRow } from './audit-chain.js'
import { isProduction } from './security.js'

export type AdminAuditInput = {
  orgId: string | null
  actor: string
  action: string
  decision?: string
  risk?: string
  reasoning: string
  context?: Record<string, unknown>
  changes?: Record<string, { before: unknown; after: unknown }>
}

/**
 * Immutable admin/configuration audit trail (SOC 2 change management).
 */
export function logAdminAuditEvent(cfg: SupabaseAuthConfig | null, input: AdminAuditInput): void {
  if (!cfg) return

  const admin = createSupabaseAdmin(cfg)
  void (async () => {
    const id = randomUUID()
    const correlation_id = randomUUID()
    const created_at = new Date().toISOString()
    const decision = input.decision ?? 'RECORDED'

    let integrity: Record<string, string | null> = {}
    if (input.orgId) {
      const fields = await chainFieldsForNewRow(admin, {
        id,
        org_id: input.orgId,
        correlation_id,
        actor: input.actor,
        action: input.action,
        decision,
        created_at,
      })
      if (fields) integrity = fields
    }

    const { error } = await admin.from('audit_events').insert({
      id,
      correlation_id,
      org_id: input.orgId,
      actor: input.actor,
      action: input.action,
      decision,
      risk: input.risk ?? 'low',
      reasoning: input.reasoning,
      context: {
        ...input.context,
        ...(input.changes ? { field_changes: input.changes } : {}),
      },
      payload: {},
      created_at,
      ...integrity,
    })
    if (error && !isProduction()) {
      console.warn('[admin_audit] persist failed', error.message)
    }
  })()
}

export function actorLabel(
  req: FastifyRequest & { sanctumUser?: { id: string; email?: string } },
): string {
  const user = req.sanctumUser
  return user?.email ?? user?.id ?? 'system'
}

export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: (keyof T)[],
): Record<string, { before: unknown; after: unknown }> | undefined {
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const key of keys) {
    const b = before[key]
    const a = after[key]
    if (b !== a) changes[String(key)] = { before: b ?? null, after: a ?? null }
  }
  return Object.keys(changes).length > 0 ? changes : undefined
}
