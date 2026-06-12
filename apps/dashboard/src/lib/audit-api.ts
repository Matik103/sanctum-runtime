import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

export type AuditEntry = ActionResult & {
  recordFingerprint?: string
  chainHash?: string
  prevChainHash?: string | null
}

export type AuditFilters = {
  decision?: string
  actor?: string
  action?: string
  search?: string
  heldOnly?: boolean
  highRiskOnly?: boolean
}

export type AuditPage = {
  entries: AuditEntry[]
  nextCursor: string | null
  totalApprox: number | null
  retentionDays: number
  chainAnchored?: boolean
  chainComplete?: boolean
  chainTotal?: number
  chainStored?: number
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

export type AuditVerifyResponse = {
  ok: boolean
  valid: boolean
  recordCount: number
  fingerprintMismatches: number
  chainBreaks: number
  firstBreakIndex: number | null
  message: string
  chainComplete?: boolean
  chainTotal?: number
  chained?: number
  chainStored?: number
}

export async function verifyOrgAuditExport(orgId: string, entries: unknown[]): Promise<AuditVerifyResponse> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/audit/verify`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new Error(body.message ?? body.error ?? `audit_verify_${res.status}`)
  }
  return res.json() as Promise<AuditVerifyResponse>
}

export async function verifyOrgAuditChain(orgId: string): Promise<AuditVerifyResponse> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/audit/verify-chain`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new Error(body.message ?? body.error ?? `audit_verify_chain_${res.status}`)
  }
  return res.json() as Promise<AuditVerifyResponse>
}

export async function rebuildOrgAuditChain(orgId: string): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/audit/rebuild-chain`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new Error(body.message ?? body.error ?? `audit_rebuild_chain_${res.status}`)
  }
  return res.json() as Promise<{ ok: boolean; updated: number }>
}
