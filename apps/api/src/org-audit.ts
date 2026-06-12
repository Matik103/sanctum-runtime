/**
 * Paginated org audit queries for dashboard Audit Logs + Runtime Activity.
 */
import {
  attachAuditChain,
  auditRecordFingerprint,
  verifyAuditExport,
  type AuditFingerprintInput,
  type VerifyExportEntry,
} from '@sanctum/audit-system/integrity'
import type { ActionResult } from '@sanctum-runtime/sdk'
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'
import { orgAuditChainStatus } from './audit-chain.js'

export {
  auditRecordFingerprint,
  attachAuditChain,
  verifyAuditExport,
  type VerifyExportEntry,
}

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
  context?: Record<string, unknown>
  payload: Record<string, unknown>
  created_at: string
  resolved_at: string | null
  shield_level?: string | null
  shield_score?: number | null
  record_fingerprint?: string | null
  chain_hash?: string | null
  prev_chain_hash?: string | null
}

export type OrgAuditEntry = ActionResult & {
  recordFingerprint: string
  chainHash?: string
  prevChainHash?: string | null
}

export function rowToActionResult(row: AuditRow): ActionResult {
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

export type OrgAuditQuery = {
  limit?: number
  cursor?: string
  decision?: string
  actor?: string
  action?: string
  search?: string
  heldOnly?: boolean
  highRiskOnly?: boolean
  since?: string
}

export type OrgAuditPage = {
  entries: OrgAuditEntry[]
  nextCursor: string | null
  totalApprox: number | null
  retentionDays: number
  chainAnchored: boolean
  chainComplete: boolean
  chainTotal: number
  chainStored: number
}

const CHAIN_LOOKBACK = 200

function rowFingerprintInput(row: AuditRow): AuditFingerprintInput {
  return {
    id: row.id,
    org_id: row.org_id,
    correlation_id: row.correlation_id,
    actor: row.actor,
    action: row.action,
    decision: row.decision,
    created_at: row.created_at,
  }
}

async function chainAnchorHash(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string,
  beforeCreatedAt: string,
): Promise<string | null> {
  const { data } = await admin
    .from('audit_events')
    .select('id, org_id, correlation_id, actor, action, decision, created_at')
    .eq('org_id', orgId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(CHAIN_LOOKBACK)

  const predecessors = ((data ?? []) as AuditRow[]).reverse()
  if (predecessors.length === 0) return null
  const chained = attachAuditChain(predecessors.map(rowFingerprintInput))
  return chained[chained.length - 1]!.chainHash
}

export async function listOrgAuditPage(
  cfg: SupabaseAuthConfig,
  orgId: string,
  opts: OrgAuditQuery = {},
  retentionDays = 30,
): Promise<OrgAuditPage> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const admin = createSupabaseAdmin(cfg)

  const sinceDefault = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
  const since = opts.since ?? sinceDefault

  let query = admin
    .from('audit_events')
    .select('*', { count: 'estimated' })
    .eq('org_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (opts.cursor) {
    query = query.lt('created_at', opts.cursor)
  }
  if (opts.heldOnly || opts.decision === 'REQUIRE_VERIFICATION') {
    query = query.eq('decision', 'REQUIRE_VERIFICATION')
  } else if (opts.decision) {
    query = query.eq('decision', opts.decision)
  }
  if (opts.actor) query = query.eq('actor', opts.actor)
  if (opts.action) query = query.ilike('action', `%${opts.action}%`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  let rows = (data ?? []) as AuditRow[]

  if (opts.search?.trim()) {
    const needle = opts.search.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.action.toLowerCase().includes(needle) ||
        r.actor.toLowerCase().includes(needle) ||
        (r.reasoning ?? '').toLowerCase().includes(needle) ||
        (r.human_record ?? '').toLowerCase().includes(needle),
    )
  }
  if (opts.highRiskOnly) {
    rows = rows.filter(
      (r) =>
        r.risk === 'high' ||
        r.risk === 'critical' ||
        (r.shield_level != null && r.shield_level !== 'clear') ||
        (r.shield_score != null && r.shield_score >= 60),
    )
  }

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.created_at : null

  const chainStatus = await orgAuditChainStatus(cfg, orgId, since)

  const chainById = new Map<string, { chainHash: string; prevChainHash: string | null }>()
  const legacyRows = pageRows.filter((r) => !r.chain_hash)
  if (legacyRows.length > 0) {
    const oldest = [...legacyRows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!.created_at
    const anchor = await chainAnchorHash(admin, orgId, oldest)
    const asc = [...legacyRows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const chained = attachAuditChain(asc.map(rowFingerprintInput), anchor)
    for (const c of chained) {
      chainById.set(c.id, { chainHash: c.chainHash, prevChainHash: c.prevChainHash })
    }
  }

  return {
    entries: pageRows.map((row) => {
      const storedChain = row.chain_hash
        ? { chainHash: row.chain_hash, prevChainHash: row.prev_chain_hash ?? null }
        : chainById.get(row.id)
      return {
        ...rowToActionResult(row),
        recordFingerprint: row.record_fingerprint ?? auditRecordFingerprint(row),
        ...(storedChain
          ? { chainHash: storedChain.chainHash, prevChainHash: storedChain.prevChainHash }
          : {}),
      }
    }),
    nextCursor,
    totalApprox: count,
    retentionDays,
    chainAnchored: chainStatus.chainComplete || legacyRows.length === 0,
    chainComplete: chainStatus.chainComplete,
    chainTotal: chainStatus.total,
    chainStored: chainStatus.chained,
  }
}
