import { describe, expect, it } from 'vitest'
import {
  attachAuditChain,
  auditChainHash,
  auditRecordFingerprint,
  verifyAuditExport,
  verifyStoredChainSequence,
} from './integrity.js'

describe('auditRecordFingerprint', () => {
  it('is stable for the same row fields', () => {
    const row = {
      id: 'id-1',
      org_id: 'org-1',
      correlation_id: 'corr-1',
      actor: 'agent-a',
      action: 'send_email',
      decision: 'APPROVED',
      created_at: '2026-05-30T12:00:00.000Z',
    }
    expect(auditRecordFingerprint(row)).toBe(auditRecordFingerprint(row))
    expect(auditRecordFingerprint(row)).toHaveLength(16)
  })
})

describe('auditChainHash', () => {
  it('links records in order', () => {
    const fp1 = auditRecordFingerprint({
      id: '1',
      org_id: 'o',
      correlation_id: 'c1',
      actor: 'a',
      action: 'x',
      decision: 'APPROVED',
      created_at: '2026-05-30T10:00:00.000Z',
    })
    const fp2 = auditRecordFingerprint({
      id: '2',
      org_id: 'o',
      correlation_id: 'c2',
      actor: 'a',
      action: 'y',
      decision: 'APPROVED',
      created_at: '2026-05-30T11:00:00.000Z',
    })
    const chain1 = auditChainHash(fp1, null)
    const chain2 = auditChainHash(fp2, chain1)
    expect(chain1).not.toBe(chain2)
    expect(attachAuditChain([
      {
        id: '1',
        org_id: 'o',
        correlation_id: 'c1',
        actor: 'a',
        action: 'x',
        decision: 'APPROVED',
        created_at: '2026-05-30T10:00:00.000Z',
      },
      {
        id: '2',
        org_id: 'o',
        correlation_id: 'c2',
        actor: 'a',
        action: 'y',
        decision: 'APPROVED',
        created_at: '2026-05-30T11:00:00.000Z',
      },
    ])).toMatchObject([
      { chainHash: chain1, prevChainHash: null },
      { chainHash: chain2, prevChainHash: chain1 },
    ])
  })
})

describe('verifyAuditExport', () => {
  it('passes for a valid chained export', () => {
    const chained = attachAuditChain([
      {
        id: '1',
        org_id: 'o',
        correlation_id: 'c1',
        actor: 'a',
        action: 'x',
        decision: 'APPROVED',
        created_at: '2026-05-30T10:00:00.000Z',
      },
    ])
    const result = verifyAuditExport(
      chained.map((r) => ({
        id: r.id,
        correlation_id: r.correlation_id,
        actor: r.actor,
        action: r.action,
        decision: r.decision,
        timestamp: r.created_at,
        recordFingerprint: r.recordFingerprint,
        chainHash: r.chainHash,
        prevChainHash: r.prevChainHash,
        context: { org_id: 'o' },
      })),
    )
    expect(result.valid).toBe(true)
  })

  it('detects tampered fingerprint', () => {
    const chained = attachAuditChain([
      {
        id: '1',
        org_id: 'o',
        correlation_id: 'c1',
        actor: 'a',
        action: 'x',
        decision: 'APPROVED',
        created_at: '2026-05-30T10:00:00.000Z',
      },
    ])
    const result = verifyAuditExport([
      {
        id: chained[0]!.id,
        actor: chained[0]!.actor,
        action: chained[0]!.action,
        decision: 'BLOCKED',
        timestamp: chained[0]!.created_at,
        recordFingerprint: chained[0]!.recordFingerprint,
        chainHash: chained[0]!.chainHash,
        context: { org_id: 'o' },
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.fingerprintMismatches).toBeGreaterThan(0)
  })
})

describe('verifyStoredChainSequence', () => {
  it('passes for attachAuditChain output', () => {
    const chained = attachAuditChain([
      {
        id: '1',
        org_id: 'o',
        correlation_id: 'c1',
        actor: 'a',
        action: 'x',
        decision: 'APPROVED',
        created_at: '2026-05-30T10:00:00.000Z',
      },
      {
        id: '2',
        org_id: 'o',
        correlation_id: 'c2',
        actor: 'a',
        action: 'y',
        decision: 'APPROVED',
        created_at: '2026-05-30T11:00:00.000Z',
      },
    ])
    const result = verifyStoredChainSequence(
      chained.map((r) => ({
        ...r,
        recordFingerprint: r.recordFingerprint,
        chainHash: r.chainHash,
        prevChainHash: r.prevChainHash,
      })),
    )
    expect(result.valid).toBe(true)
  })
})
