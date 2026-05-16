import { createClient } from '@supabase/supabase-js'
import type { ActionResult } from '@sanctum-runtime/sdk'

let client: ReturnType<typeof createClient> | null = null

function getClient() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return client
}

function orgIdFromContext(context: Record<string, unknown>): string | null {
  const id = context.org_id ?? context.orgId
  return id != null ? String(id) : null
}

/** Mirror audit entries to Supabase when configured (optional cloud path). */
export async function maybeSyncAuditToSupabase(entry: ActionResult): Promise<void> {
  const sb = getClient()
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
