import type { ActionResult } from '@sanctum-runtime/sdk'
import {
  auditChainHash,
  auditRecordFingerprint,
} from '@sanctum/audit-system/integrity'
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

  const shieldExtras: Record<string, unknown> = {}
  if (entry.shield?.level != null) {
    shieldExtras['shield_level'] = entry.shield.level
    shieldExtras['shield_score'] = entry.shield.score ?? null
  }

  // Best-effort persistence: this must NEVER throw. A cold Supabase connection
  // (DNS/TLS not yet warm right after a deploy) can make the underlying fetch
  // *reject* rather than return `{ error }`. Letting that propagate would crash
  // an otherwise-successful verifyAction with a 500. Swallow all failures —
  // verification correctness does not depend on the audit row being written.
  try {
    const orgId = orgIdFromContext(entry.context ?? {})
    let integrityFields: Record<string, string | null> = {}

    if (orgId) {
      const { data: existing } = await sb
        .from('audit_events')
        .select('id, chain_hash, record_fingerprint, prev_chain_hash')
        .eq('id', entry.id)
        .maybeSingle()

      if (existing?.chain_hash && existing.record_fingerprint) {
        integrityFields = {
          record_fingerprint: existing.record_fingerprint,
          chain_hash: existing.chain_hash,
          prev_chain_hash: existing.prev_chain_hash ?? null,
        }
      } else if (!existing) {
        const { data: latest } = await sb
          .from('audit_events')
          .select('chain_hash')
          .eq('org_id', orgId)
          .not('chain_hash', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const prevChain = (latest as { chain_hash?: string } | null)?.chain_hash ?? null
        const fpInput = {
          id: entry.id,
          org_id: orgId,
          correlation_id: entry.correlationId,
          actor: entry.actor,
          action: entry.action,
          decision: entry.decision,
          created_at: entry.timestamp,
        }
        const record_fingerprint = auditRecordFingerprint(fpInput)
        integrityFields = {
          record_fingerprint,
          chain_hash: auditChainHash(record_fingerprint, prevChain),
          prev_chain_hash: prevChain,
        }
      }
    }

    const { error } = await sb.from('audit_events').upsert(
      {
        id: entry.id,
        correlation_id: entry.correlationId,
        org_id: orgId,
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
        ...shieldExtras,
        ...integrityFields,
      },
      { onConflict: 'id' },
    )

    if (error) {
      console.error('[sanctum] audit sync to Supabase failed:', error.message)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sanctum] audit sync to Supabase threw (best-effort, ignored):', msg)
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
