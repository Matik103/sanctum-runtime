import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

export type AuditFilters = {
  decision?: string
  actor?: string
  action?: string
  search?: string
  heldOnly?: boolean
  highRiskOnly?: boolean
}

export type AuditPage = {
  entries: ActionResult[]
  nextCursor: string | null
  totalApprox: number | null
  retentionDays: number
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchOrgAuditPage(
  orgId: string,
  filters: AuditFilters = {},
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<AuditPage> {
  const params = new URLSearchParams()
  params.set('limit', String(opts.limit ?? 50))
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (filters.decision) params.set('decision', filters.decision)
  if (filters.actor) params.set('actor', filters.actor)
  if (filters.action) params.set('action', filters.action)
  if (filters.search) params.set('search', filters.search)
  if (filters.heldOnly) params.set('held_only', 'true')
  if (filters.highRiskOnly) params.set('high_risk', 'true')

  const res = await fetch(
    `${apiBaseUrl}/v1/orgs/${orgId}/audit?${params.toString()}`,
    { headers: await authHeaders() },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new Error(body.message ?? body.error ?? `audit_${res.status}`)
  }
  return res.json() as Promise<AuditPage>
}
