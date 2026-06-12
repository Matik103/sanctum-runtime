/**
 * Shared Connect Live Feed queries — proxy audit events for dashboard SSE + REST.
 */
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'

export type ConnectProxyEvent = {
  id: string
  org_id: string
  action: string
  actor: string
  decision: string
  reasoning?: string
  correlation_id?: string
  sourceTrust?: string
  blastRadius?: Record<string, unknown>
  shieldLevel?: string
  shieldScore?: number
  actionIdentity?: Record<string, unknown>
  context: {
    proxy: true
    platform: string
    agent_id?: string
    agent_name?: string
    tool_call_id: string
    arguments: unknown
    phase?: string
  }
  created_at: string
}

function nestedRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = raw[key]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}

function fieldsFromPayload(raw: Record<string, unknown>): {
  blastRadius?: Record<string, unknown>
  actionIdentity?: Record<string, unknown>
  sourceTrust?: string
} {
  const payload = nestedRecord(raw.payload) ?? {}
  const blastRaw =
    raw.blastRadius ??
    raw.blast_radius ??
    payload.blastRadius ??
    payload.blast_radius
  const identityRaw =
    raw.actionIdentity ??
    raw.action_identity ??
    payload.actionIdentity ??
    payload.action_identity
  const sourceTrust =
    pickString(raw, 'sourceTrust', 'source_trust') ??
    pickString(payload, 'sourceTrust', 'source_trust')
  return {
    blastRadius: nestedRecord(blastRaw),
    actionIdentity: nestedRecord(identityRaw),
    sourceTrust,
  }
}

export function normalizeConnectProxyRow(raw: Record<string, unknown>): ConnectProxyEvent | null {
  const ctx = (raw.context as Record<string, unknown> | undefined) ?? {}
  if (ctx.proxy !== true) return null
  const payloadFields = fieldsFromPayload(raw)
  const created =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.timestamp === 'string' && raw.timestamp) ||
    new Date().toISOString()
  return {
    id: String(raw.id ?? ''),
    org_id: String(raw.org_id ?? ctx.org_id ?? ''),
    action: String(raw.action ?? ''),
    actor: String(raw.actor ?? ''),
    decision: String(raw.decision ?? 'APPROVED'),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
    correlation_id:
      typeof raw.correlation_id === 'string'
        ? raw.correlation_id
        : typeof raw.correlationId === 'string'
          ? raw.correlationId
          : undefined,
    sourceTrust:
      pickString(raw, 'sourceTrust', 'source_trust') ?? payloadFields.sourceTrust,
    blastRadius: payloadFields.blastRadius,
    shieldLevel:
      pickString(raw, 'shield_level', 'shieldLevel') ??
      (typeof (raw.payload as Record<string, unknown> | undefined)?.shield === 'object'
        ? pickString((raw.payload as Record<string, unknown>).shield as Record<string, unknown>, 'level')
        : undefined),
    shieldScore:
      typeof raw.shield_score === 'number'
        ? raw.shield_score
        : typeof raw.shieldScore === 'number'
          ? raw.shieldScore
          : undefined,
    actionIdentity: payloadFields.actionIdentity,
    context: {
      proxy: true,
      platform: String(ctx.platform ?? 'unknown'),
      agent_id: ctx.agent_id != null ? String(ctx.agent_id) : undefined,
      agent_name: ctx.agent_name != null ? String(ctx.agent_name) : undefined,
      tool_call_id: String(ctx.tool_call_id ?? ''),
      arguments: ctx.arguments,
      phase: ctx.phase != null ? String(ctx.phase) : undefined,
    },
    created_at: created,
  }
}

export async function listConnectProxyEvents(
  cfg: SupabaseAuthConfig,
  orgId: string,
  opts: {
    limit?: number
    decision?: string
    platform?: string
    action?: string
    agentId?: string
    heldOnly?: boolean
  } = {},
): Promise<ConnectProxyEvent[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const admin = createSupabaseAdmin(cfg)
  let query = admin
    .from('audit_events')
    .select('*')
    .eq('org_id', orgId)
    .contains('context', { proxy: true })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts.heldOnly || opts.decision === 'REQUIRE_VERIFICATION') {
    query = query.eq('decision', 'REQUIRE_VERIFICATION')
  } else if (opts.decision) {
    query = query.eq('decision', opts.decision)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  let rows = (data ?? [])
    .map((row) => normalizeConnectProxyRow(row as Record<string, unknown>))
    .filter((e): e is ConnectProxyEvent => e != null)

  if (opts.platform) {
    rows = rows.filter((e) => e.context.platform === opts.platform)
  }
  if (opts.action) {
    const needle = opts.action.toLowerCase()
    rows = rows.filter((e) => e.action.toLowerCase().includes(needle))
  }
  if (opts.agentId) {
    rows = rows.filter(
      (e) => e.context.agent_id === opts.agentId || e.actor === opts.agentId,
    )
  }

  return rows
}

export async function countHeldConnectEvents(
  cfg: SupabaseAuthConfig,
  orgId: string,
): Promise<number> {
  const admin = createSupabaseAdmin(cfg)
  const { count, error } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('decision', 'REQUIRE_VERIFICATION')
    .contains('context', { proxy: true })

  if (error) throw new Error(error.message)
  return count ?? 0
}
