import type { ActionResult } from '@sanctum-runtime/sdk'
import { getSupabaseServiceClient } from './supabase-client.js'

function orgIdFromContext(context: Record<string, unknown>): string | null {
  const id = context.org_id ?? context.orgId
  return id != null ? String(id) : null
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
      payload: entry,
      created_at: entry.timestamp,
      resolved_at: entry.resolvedAt ?? null,
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.error('[sanctum] audit sync to Supabase failed:', error.message)
  }
}
