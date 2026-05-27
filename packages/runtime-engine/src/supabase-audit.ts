import type { ActionResult } from '@sanctum-runtime/sdk'
import { getSupabaseServiceClient } from './supabase-client.js'

type AuditRow = {
  id: string
  correlation_id: string
  org_id: string | null
  actor: string
  action: string
  decision: string
  risk: string | null
  reasoning: string | null
  human_record: string | null
  human_resolution: string | null
  anomaly_flags: string[] | null
  resolved_by: string | null
  payload: Record<string, unknown>
  created_at: string
  resolved_at: string | null
}

function orgIdFromContext(context: Record<string, unknown>): string | null {
  const id = context.org_id ?? context.orgId
  return id != null ? String(id) : null
}

function rowToActionResult(row: AuditRow): ActionResult {
  const payload = row.payload as Partial<ActionResult> | undefined
  if (payload?.id && payload.correlationId) {
    return {
      ...payload,
      id: row.id,
      correlationId: row.correlation_id,
      actor: row.actor,
      action: row.action,
      decision: row.decision as ActionResult['decision'],
      risk: (row.risk ?? payload.risk ?? 'low') as ActionResult['risk'],
      reasoning: row.reasoning ?? payload.reasoning ?? '',
      humanRecord: row.human_record ?? payload.humanRecord,
      humanResolution: row.human_resolution ?? payload.humanResolution,
      anomalyFlags: row.anomaly_flags ?? payload.anomalyFlags ?? [],
      resolvedAt: row.resolved_at ?? payload.resolvedAt,
      timestamp: row.created_at ?? payload.timestamp,
      context: {
        ...(row.context ?? payload.context ?? {}),
        ...(row.org_id ? { org_id: row.org_id } : {}),
      },
    } as ActionResult
  }

  return {
    id: row.id,
    correlationId: row.correlation_id,
    actor: row.actor,
    action: row.action,
    context: {
      ...(row.context ?? {}),
      ...(row.org_id ? { org_id: row.org_id } : {}),
    },
    decision: row.decision as ActionResult['decision'],
    risk: (row.risk ?? 'low') as ActionResult['risk'],
    reasoning: row.reasoning ?? '',
    policyPath: 'policy.unknown',
    anomalyFlags: row.anomaly_flags ?? [],
    timestamp: row.created_at,
    offlineMode: true,
    evaluationMode: 'offline_forced',
    modelInvoked: false,
    ollamaConnected: false,
    humanRecord: row.human_record ?? undefined,
    humanResolution: row.human_resolution ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
  }
}

/** Mirror audit entries to Supabase when configured (optional cloud path). */
export async function maybeSyncAuditToSupabase(entry: ActionResult): Promise<void> {
  const sb = getSupabaseServiceClient()
  if (!sb) return

  const { error } = await sb.from('audit_events').upsert(
    {
      id: entry.id,
      correlation_id: entry.correlationId,
      org_id: orgIdFromContext(entry.context),
      actor: entry.actor,
      action: entry.action,
      decision: entry.decision,
      risk: entry.risk,
      reasoning: entry.reasoning,
      human_record: entry.humanRecord ?? null,
      human_resolution: entry.humanResolution ?? null,
      anomaly_flags: entry.anomalyFlags ?? [],
      context: entry.context ?? {},
      resolved_by: (entry as unknown as { resolvedBy?: string }).resolvedBy ?? null,
      payload: entry,
      created_at: entry.timestamp,
      resolved_at: entry.resolvedAt ?? null,
      // Shield columns (migration 052) — populated when a Shield assessment ran.
      shield_level: entry.shield?.level ?? null,
      shield_score: entry.shield?.score ?? null,
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('[sanctum] audit sync to Supabase failed:', error.message)
  }
}

/** Load persisted audit from Supabase (survives API redeploy / ephemeral disk). */
export async function loadAuditFromSupabase(
  limit = 200,
  orgId?: string,
): Promise<ActionResult[]> {
  const sb = getSupabaseServiceClient()
  if (!sb) return []

  let q = sb
    .from('audit_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (orgId) q = q.eq('org_id', orgId)

  const { data, error } = await q
  if (error) {
    console.error('[sanctum] load audit from Supabase failed:', error.message)
    return []
  }
  return (data as AuditRow[]).map(rowToActionResult)
}

export async function fetchAuditById(id: string): Promise<ActionResult | null> {
  const sb = getSupabaseServiceClient()
  if (!sb) return null

  const { data, error } = await sb.from('audit_events').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return rowToActionResult(data as AuditRow)
}
