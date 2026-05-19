/**
 * Query timeouts and row caps for Supabase free tier.
 *
 * Free projects enforce ~8s PostgREST statement timeouts. The API stays under
 * ~5s per query, avoids parallel fan-out on heavy reads, and caps row counts
 * so exports/compliance reports do not kill the database.
 *
 * Override: SUPABASE_QUERY_TIMEOUT_MS (default 5000)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_QUERY_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(2000, Number(process.env.SUPABASE_QUERY_TIMEOUT_MS ?? 5000) || 5000),
)

/** Hard caps for list/export/compliance queries. */
export const SUPABASE_ROW_LIMITS = {
  auditExport: 500,
  usageExport: 1000,
  auditCompliance: 2000,
  auditTimeline: 2000,
  exportAuditHistory: 100,
  runtimesList: 200,
  agentsList: 200,
  runtimeEventsList: 100,
  policyVersions: 200,
  approvals: 200,
  policySnapshots: 500,
} as const

export type SupabaseQueryResult<T> = {
  data: T
  error?: string
}

export async function queryWithTimeout<T>(
  label: string,
  run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  timeoutMs = SUPABASE_QUERY_TIMEOUT_MS,
): Promise<SupabaseQueryResult<T>> {
  try {
    const result = await Promise.race([
      run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ])
    if (result.error) {
      return { data: [] as T, error: `${label}: ${result.error.message}` }
    }
    return { data: (result.data ?? []) as T }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: [] as T, error: `${label}: ${msg}` }
  }
}

export async function verifyOrgMembership(
  admin: SupabaseClient,
  userId: string,
  orgIdParam: string,
): Promise<{ orgId: string | null; warning?: string }> {
  const result = await queryWithTimeout<{ org_id: string }[]>(
    'organization_members',
    () => admin.from('organization_members').select('org_id').eq('user_id', userId),
  )
  if (result.error) {
    return { orgId: null, warning: result.error }
  }
  const orgs = result.data.map((r) => r.org_id)
  if (orgs.includes(orgIdParam)) return { orgId: orgIdParam }
  return { orgId: null }
}
