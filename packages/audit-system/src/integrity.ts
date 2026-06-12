import { createHash } from 'node:crypto'

export type AuditFingerprintInput = {
  id: string
  org_id: string | null
  correlation_id: string
  actor: string
  action: string
  decision: string
  created_at: string
}

export type ChainedAuditRecord = AuditFingerprintInput & {
  recordFingerprint: string
  chainHash: string
  prevChainHash: string | null
}

export type AuditVerifyResult = {
  valid: boolean
  recordCount: number
  fingerprintMismatches: number
  chainBreaks: number
  firstBreakIndex: number | null
  message: string
}

const GENESIS = 'sanctum-audit-genesis'

/** Deterministic SHA-256 fingerprint (first 16 hex chars) for tamper-evident display. */
export function auditRecordFingerprint(row: AuditFingerprintInput): string {
  const canonical = JSON.stringify({
    id: row.id,
    org_id: row.org_id,
    correlation_id: row.correlation_id,
    actor: row.actor,
    action: row.action,
    decision: row.decision,
    created_at: row.created_at,
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

/** Chain link: SHA-256(prev chain + record fingerprint), first 16 hex chars. */
export function auditChainHash(recordFingerprint: string, prevChainHash: string | null): string {
  const material = `${prevChainHash ?? GENESIS}:${recordFingerprint}`
  return createHash('sha256').update(material).digest('hex').slice(0, 16)
}

/** Build chain metadata for rows sorted ascending by created_at. */
export function attachAuditChain(
  rowsAsc: AuditFingerprintInput[],
  anchorPrevChainHash: string | null = null,
): ChainedAuditRecord[] {
  let prevChain = anchorPrevChainHash
  return rowsAsc.map((row) => {
    const recordFingerprint = auditRecordFingerprint(row)
    const chainHash = auditChainHash(recordFingerprint, prevChain)
    const prevChainHash = prevChain
    prevChain = chainHash
    return { ...row, recordFingerprint, chainHash, prevChainHash }
  })
}

export type VerifyExportEntry = {
  id: string
  correlationId?: string
  correlation_id?: string
  actor: string
  action: string
  decision: string
  timestamp?: string
  created_at?: string
  recordFingerprint?: string
  chainHash?: string
  prevChainHash?: string | null
  context?: Record<string, unknown>
}

/** Verify an exported audit slice (fingerprints + chain links). */
export function verifyAuditExport(entries: VerifyExportEntry[]): AuditVerifyResult {
  if (entries.length === 0) {
    return {
      valid: true,
      recordCount: 0,
      fingerprintMismatches: 0,
      chainBreaks: 0,
      firstBreakIndex: null,
      message: 'No records to verify.',
    }
  }

  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.timestamp ?? a.created_at ?? 0).getTime()
    const tb = new Date(b.timestamp ?? b.created_at ?? 0).getTime()
    return ta - tb
  })

  let fingerprintMismatches = 0
  let chainBreaks = 0
  let firstBreakIndex: number | null = null
  let prevChain: string | null = null

  sorted.forEach((entry, index) => {
    const ctx = entry.context ?? {}
    const orgId =
      (typeof ctx.org_id === 'string' ? ctx.org_id : null) ??
      (typeof ctx.orgId === 'string' ? ctx.orgId : null)

    const row: AuditFingerprintInput = {
      id: entry.id,
      org_id: orgId,
      correlation_id: entry.correlationId ?? entry.correlation_id ?? entry.id,
      actor: entry.actor,
      action: entry.action,
      decision: entry.decision,
      created_at: entry.timestamp ?? entry.created_at ?? '',
    }

    const expectedFp = auditRecordFingerprint(row)
    if (entry.recordFingerprint && entry.recordFingerprint !== expectedFp) {
      fingerprintMismatches += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }

    const fp = entry.recordFingerprint ?? expectedFp
    const expectedChain = auditChainHash(fp, prevChain)
    if (entry.chainHash && entry.chainHash !== expectedChain) {
      chainBreaks += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }
    if (entry.prevChainHash != null && entry.prevChainHash !== prevChain) {
      chainBreaks += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }

    prevChain = entry.chainHash ?? expectedChain
  })

  const valid = fingerprintMismatches === 0 && chainBreaks === 0
  const message = valid
    ? `${sorted.length} record${sorted.length === 1 ? '' : 's'} — fingerprints and chain links verified.`
    : `Integrity issue: ${fingerprintMismatches} fingerprint mismatch${fingerprintMismatches === 1 ? '' : 'es'}, ${chainBreaks} chain break${chainBreaks === 1 ? '' : 's'}.`

  return {
    valid,
    recordCount: sorted.length,
    fingerprintMismatches,
    chainBreaks,
    firstBreakIndex,
    message,
  }
}

export type StoredChainRow = AuditFingerprintInput & {
  recordFingerprint?: string | null
  chainHash?: string | null
  prevChainHash?: string | null
}

/** Verify persisted chain sequence from DB (genesis → latest). */
export function verifyStoredChainSequence(rowsAsc: StoredChainRow[]): AuditVerifyResult {
  if (rowsAsc.length === 0) {
    return {
      valid: true,
      recordCount: 0,
      fingerprintMismatches: 0,
      chainBreaks: 0,
      firstBreakIndex: null,
      message: 'No records to verify.',
    }
  }

  let fingerprintMismatches = 0
  let chainBreaks = 0
  let firstBreakIndex: number | null = null
  let prevChain: string | null = null

  rowsAsc.forEach((row, index) => {
    const expectedFp = auditRecordFingerprint(row)
    const storedFp = row.recordFingerprint ?? expectedFp

    if (row.recordFingerprint && row.recordFingerprint !== expectedFp) {
      fingerprintMismatches += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }

    const expectedChain = auditChainHash(storedFp, prevChain)
    if (row.chainHash && row.chainHash !== expectedChain) {
      chainBreaks += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }
    if (row.prevChainHash != null && row.prevChainHash !== prevChain) {
      chainBreaks += 1
      if (firstBreakIndex === null) firstBreakIndex = index
    }

    prevChain = row.chainHash ?? expectedChain
  })

  const valid = fingerprintMismatches === 0 && chainBreaks === 0
  const message = valid
    ? `${rowsAsc.length} record${rowsAsc.length === 1 ? '' : 's'} — genesis chain verified from org store.`
    : `Integrity issue: ${fingerprintMismatches} fingerprint mismatch${fingerprintMismatches === 1 ? '' : 'es'}, ${chainBreaks} chain break${chainBreaks === 1 ? '' : 's'}.`

  return {
    valid,
    recordCount: rowsAsc.length,
    fingerprintMismatches,
    chainBreaks,
    firstBreakIndex,
    message,
  }
}
