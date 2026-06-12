import { describe, expect, it } from 'vitest'
import { auditRecordFingerprint, rowToActionResult } from './org-audit.js'

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

  it('changes when decision changes', () => {
    const base = {
      id: 'id-1',
      org_id: 'org-1',
      correlation_id: 'corr-1',
      actor: 'agent-a',
      action: 'send_email',
      created_at: '2026-05-30T12:00:00.000Z',
    }
    expect(auditRecordFingerprint({ ...base, decision: 'APPROVED' })).not.toBe(
      auditRecordFingerprint({ ...base, decision: 'BLOCKED' }),
    )
  })
})

describe('rowToActionResult', () => {
  it('maps supabase audit rows to ActionResult', () => {
    const row = rowToActionResult({
      id: 'id-1',
      correlation_id: 'corr-1',
      org_id: 'org-1',
      actor: 'agent-a',
      action: 'send_email',
      decision: 'APPROVED',
      risk: 'low',
      reasoning: 'ok',
      human_record: null,
      human_resolution: null,
      anomaly_flags: [],
      context: { org_id: 'org-1' },
      payload: {
        id: 'id-1',
        correlationId: 'corr-1',
        actor: 'agent-a',
        action: 'send_email',
        decision: 'APPROVED',
        risk: 'low',
        reasoning: 'ok',
        policyPath: 'policy.send_email',
        anomalyFlags: [],
        timestamp: '2026-05-30T12:00:00.000Z',
        context: {},
      },
      created_at: '2026-05-30T12:00:00.000Z',
      resolved_at: null,
    })
    expect(row.action).toBe('send_email')
    expect(row.decision).toBe('APPROVED')
  })

  it('hydrates shield from row columns when payload omits shield', () => {
    const row = rowToActionResult({
      id: 'id-2',
      correlation_id: 'corr-2',
      org_id: 'org-1',
      actor: 'agent-a',
      action: 'transfer_funds',
      decision: 'BLOCKED',
      risk: 'high',
      reasoning: 'blocked',
      human_record: null,
      human_resolution: null,
      anomaly_flags: ['high_value_transfer'],
      shield_level: 'critical',
      shield_score: 88,
      context: { org_id: 'org-1' },
      payload: {
        id: 'id-2',
        correlationId: 'corr-2',
        actor: 'agent-a',
        action: 'transfer_funds',
        decision: 'BLOCKED',
        risk: 'high',
        reasoning: 'blocked',
        policyPath: 'policy.transfer_funds',
        anomalyFlags: ['high_value_transfer'],
        timestamp: '2026-05-30T12:00:00.000Z',
        context: {},
      },
      created_at: '2026-05-30T12:00:00.000Z',
      resolved_at: null,
    })
    expect(row.shield?.level).toBe('critical')
    expect(row.shield?.score).toBe(88)
  })
})
