import { describe, expect, it } from 'vitest'
import { rowToActionResult } from './org-audit.js'

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
})
