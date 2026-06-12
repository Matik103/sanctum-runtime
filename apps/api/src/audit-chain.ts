/**
 * Org-scoped audit hash chain: compute on insert, rebuild backfill, genesis verify.
 */
import {
  attachAuditChain,
  auditChainHash,
  auditRecordFingerprint,
  verifyStoredChainSequence,
  type AuditFingerprintInput,
  type AuditVerifyResult,
} from '@sanctum/audit-system/integrity'
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'

export type AuditChainRow = AuditFingerprintInput & {
  record_fingerprint?: string | null
  chain_hash?: string | null
  prev_chain_hash?: string | null
}

export function rowToFingerprintInput(row: AuditChainRow): AuditFingerprintInput {
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

export function computeChainFields(
  row: AuditFingerprintInput,
  prevChainHash: string | null,
): { record_fingerprint: string; chain_hash: string; prev_chain_hash: string | null } {
  const record_fingerprint = auditRecordFingerprint(row)
  const chain_hash = auditChainHash(record_fingerprint, prevChainHash)
  return { record_fingerprint, chain_hash, prev_chain_hash: prevChainHash }
}

/** Latest chain_hash for an org (by created_at). */
export async function fetchLatestOrgChainHash(
  admin: ReturnType<typeof createSupabaseAdmin>,
  orgId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('audit_events')
    .select('chain_hash')
    .eq('org_id', orgId)
    .not('chain_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { chain_hash?: string } | null)?.chain_hash ?? null
}

/** Chain fields for a new audit row (call before insert). */
export async function chainFieldsForNewRow(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: AuditFingerprintInput,
): Promise<{ record_fingerprint: string; chain_hash: string; prev_chain_hash: string | null } | null> {
  if (!row.org_id) return null
  const prev = await fetchLatestOrgChainHash(admin, row.org_id)
  return computeChainFields(row, prev)
}

export type ChainStatus = {
  total: number
  chained: number
  chainComplete: boolean
}

export async function orgAuditChainStatus(
  cfg: SupabaseAuthConfig,
  orgId: string,
  since: string,
): Promise<ChainStatus> {
  const admin = createSupabaseAdmin(cfg)
  const { count: total } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)

  const { count: chained } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)
    .not('chain_hash', 'is', null)

  const t = total ?? 0
  const c = chained ?? 0
  return { total: t, chained: c, chainComplete: t > 0 && c === t }
}

const REBUILD_BATCH = 500

/** Recompute and persist chain for all org rows in retention window (ascending). */
export async function rebuildOrgAuditChain(
  cfg: SupabaseAuthConfig,
  orgId: string,
  since: string,
): Promise<{ updated: number }> {
  const admin = createSupabaseAdmin(cfg)
  let updated = 0
  let anchor: string | null = null
  let offset = 0

  for (;;) {
    const { data, error } = await admin
      .from('audit_events')
      .select('id, org_id, correlation_id, actor, action, decision, created_at')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(offset, offset + REBUILD_BATCH - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as AuditChainRow[]
    if (rows.length === 0) break

    const chained = attachAuditChain(rows.map(rowToFingerprintInput), anchor)
    for (const c of chained) {
      const { error: upErr } = await admin
        .from('audit_events')
        .update({
          record_fingerprint: c.recordFingerprint,
          chain_hash: c.chainHash,
          prev_chain_hash: c.prevChainHash,
        })
        .eq('id', c.id)
      if (upErr) throw new Error(upErr.message)
      updated += 1
    }

    anchor = chained[chained.length - 1]!.chainHash
    if (rows.length < REBUILD_BATCH) break
    offset += REBUILD_BATCH
  }

  return { updated }
}

/** Full genesis verification from stored DB rows in retention window. */
export async function verifyOrgAuditChainGenesis(
  cfg: SupabaseAuthConfig,
  orgId: string,
  since: string,
  limit = 5000,
): Promise<AuditVerifyResult & ChainStatus> {
  const admin = createSupabaseAdmin(cfg)
  const status = await orgAuditChainStatus(cfg, orgId, since)

  const { data, error } = await admin
    .from('audit_events')
    .select(
      'id, org_id, correlation_id, actor, action, decision, created_at, record_fingerprint, chain_hash, prev_chain_hash',
    )
    .eq('org_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as AuditChainRow[]

  const verify = verifyStoredChainSequence(
    rows.map((r) => ({
      ...rowToFingerprintInput(r),
      recordFingerprint: r.record_fingerprint ?? undefined,
      chainHash: r.chain_hash ?? undefined,
      prevChainHash: r.prev_chain_hash ?? undefined,
    })),
  )

  const truncated = (status.total > limit)
  const message = truncated
    ? `${verify.message} (sampled first ${limit} of ${status.total} records — run rebuild if chain incomplete)`
    : verify.message

  return {
    ...verify,
    message,
    ...status,
  }
}
