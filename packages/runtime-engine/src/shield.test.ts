import { describe, expect, it } from 'vitest'
import type { ActionRequest, ActionResult } from '@sanctum-runtime/sdk'
import { deriveSourceTrust, estimateBlastRadius } from './action-context'
import { assessShield } from './shield'

function request(action: string, context: Record<string, unknown> = {}): ActionRequest {
  return { actor: 'agent-1', action, context }
}

function assess(
  action: string,
  context: Record<string, unknown> = {},
  anomalyFlags: string[] = [],
  recentAudit: ActionResult[] = [],
) {
  const actionRequest = request(action, context)
  return assessShield(actionRequest, {
    anomalyFlags,
    sourceTrust: deriveSourceTrust(actionRequest),
    blastRadius: estimateBlastRadius(actionRequest),
    recentAudit,
    now: new Date('2026-05-26T12:00:00Z'),
  })
}

function blockedHistory(timestamp: string): ActionResult {
  return {
    id: `audit-${timestamp}`,
    correlationId: `correlation-${timestamp}`,
    actor: 'agent-1',
    action: 'read_secrets',
    context: {},
    risk: 'high',
    reasoning: 'blocked',
    decision: 'BLOCKED',
    policyVersion: 'test',
    anomalyFlags: [],
    timestamp,
    offlineMode: false,
    ollamaConnected: false,
  }
}

function heldHistory(timestamp: string): ActionResult {
  return {
    id: `audit-${timestamp}`,
    correlationId: `correlation-${timestamp}`,
    actor: 'agent-1',
    action: 'send_email',
    context: {},
    risk: 'medium',
    reasoning: 'held',
    decision: 'REQUIRE_VERIFICATION',
    policyVersion: 'test',
    anomalyFlags: [],
    timestamp,
    offlineMode: false,
    ollamaConnected: false,
  }
}

// ── Core containment cases ────────────────────────────────────────────────────

describe('assessShield', () => {
  it('blocks attempts to disable security and audit controls', () => {
    const result = assess('disable_security_logging', { instructionSource: 'tool_output' })

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((s) => s.id)).toContain('security_control_tamper')
    expect(result.automaticResponse).toContain('block_action')
    expect(result.recommendedResponse).toContain('revoke_temporary_permissions')
  })

  it('blocks untrusted requests that attempt to retrieve secrets', () => {
    const result = assess('read_api_key', { instructionSource: 'webpage' })

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((s) => s.id)).toContain('secret_access_attempt')
  })

  it('blocks physical actions with lethal or vulnerable context', () => {
    const result = assess('unlock_door', { owner_sleeping: true })

    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((s) => s.id)).toContain('physical_safety_emergency')
  })

  it('blocks financial actions whose estimated exposure exceeds the critical threshold', () => {
    const result = assess('transfer_funds', { amount: 15_000 })

    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((s) => s.id)).toContain('critical_financial_exposure')
    expect(result.signals.map((s) => s.id)).not.toContain('high_value_transfer')
  })

  it('holds high-risk injection signals for a human decision', () => {
    const result = assess('send_email', {}, ['suspicious_prompt_pattern'])

    expect(result.level).toBe('high')
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
    expect(result.automaticResponse).toContain('hold_for_review')
    expect(result.automaticResponse).toContain('alert_operator')
    expect(result.recommendedResponse).toContain('isolate_actor')
  })

  it('escalates repeated blocked requests into containment', () => {
    const result = assess('send_email', {}, [], [
      blockedHistory('2026-05-26T11:58:00Z'),
      blockedHistory('2026-05-26T11:59:00Z'),
    ])

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((s) => s.id)).toContain('repeated_blocked_attempts')
  })

  it('records an unknown execution environment without prematurely blocking', () => {
    const result = assess('read_calendar', { newDevice: true })

    expect(result.level).toBe('elevated')
    expect(result.requiredDecision).toBeUndefined()
    expect(result.signals.map((s) => s.id)).toContain('unknown_device_or_location')
    expect(result.automaticResponse).toContain('alert_operator')
  })
})

// ── Gap fixes: previously missing signal coverage ─────────────────────────────

describe('assessShield — gap coverage', () => {
  // Fix 1: high_blast_radius signal now explicitly emitted
  it('emits high_blast_radius signal for high-blast actions', () => {
    // cancel_payment: IRREVERSIBLE (cancel +20) + HIGH_VALUE (payment +30) + base(10) = 60 → high
    const result = assess('cancel_payment')

    expect(result.signals.map((s) => s.id)).toContain('high_blast_radius')
    expect(result.level).not.toBe('clear')
  })

  it('emits high_blast_radius for critical-blast actions and lifts score floor to 70', () => {
    // terminate_wire_robot: IRREVERSIBLE (terminate +20) + HIGH_VALUE (wire +30) + PHYSICAL (robot +30) + base(10) = 90 → critical
    const result = assess('terminate_wire_robot')

    const blastSig = result.signals.find((s) => s.id === 'high_blast_radius')
    expect(blastSig).toBeDefined()
    expect(result.score).toBeGreaterThanOrEqual(70) // critical blast floor
  })

  // Fix 2: high_value_transfer now emitted for amounts in [$1k, $10k) range
  it('holds financial transfers in the elevated range ($1k–$9,999) for verification', () => {
    const result = assess('transfer_funds', { amount: 5_000 })

    expect(result.signals.map((s) => s.id)).toContain('high_value_transfer')
    expect(result.signals.map((s) => s.id)).not.toContain('critical_financial_exposure')
    // Must be held for human verification, not auto-blocked
    expect(result.level).toBe('high')
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
  })

  it('does not flag low-value transfers (< $1k)', () => {
    const result = assess('transfer_funds', { amount: 50 })

    expect(result.signals.map((s) => s.id)).not.toContain('high_value_transfer')
    expect(result.signals.map((s) => s.id)).not.toContain('critical_financial_exposure')
  })

  it('treats a transfer of exactly $1,000 as elevated review threshold', () => {
    const result = assess('wire_transfer', { amount: 1_000 })

    expect(result.signals.map((s) => s.id)).toContain('high_value_transfer')
  })

  it('treats a transfer of exactly $10,000 as critical containment threshold', () => {
    const result = assess('transfer_funds', { amount: 10_000 })

    expect(result.signals.map((s) => s.id)).toContain('critical_financial_exposure')
    expect(result.requiredDecision).toBe('BLOCKED')
  })

  // Behavioral history: approval fatigue (3+ interruptions, not necessarily blocks)
  it('recognises approval fatigue from 3 held actions without full blocks', () => {
    const result = assess('send_message', {}, [], [
      heldHistory('2026-05-26T11:55:00Z'),
      heldHistory('2026-05-26T11:57:00Z'),
      heldHistory('2026-05-26T11:59:00Z'),
    ])

    expect(result.signals.map((s) => s.id)).toContain('approval_fatigue_pattern')
    expect(result.level).toBe('high')
    // Should not escalate to full block (only 2 blocks triggers that)
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
  })

  // Out-of-window history should not trigger behavioral signals
  it('ignores blocked attempts older than 15 minutes', () => {
    const result = assess('send_email', {}, [], [
      blockedHistory('2026-05-26T11:40:00Z'), // 20 min before noon
      blockedHistory('2026-05-26T11:44:00Z'), // 16 min before noon
    ])

    expect(result.signals.map((s) => s.id)).not.toContain('repeated_blocked_attempts')
    expect(result.signals.map((s) => s.id)).not.toContain('approval_fatigue_pattern')
  })

  // Trusted source accessing secrets → high not critical
  it('rates trusted-source secret access as high rather than critical', () => {
    const result = assess('read_api_key', { instructionSource: 'user_message' })

    const sig = result.signals.find((s) => s.id === 'secret_access_attempt')
    expect(sig?.severity).toBe('high')
    expect(result.level).toBe('high')
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
  })

  it('holds sensitive tool results before model re-ingestion', () => {
    const result = assess('tool_result', {
      proxy: true,
      phase: 'tool_result',
      arguments: {
        content: 'CONFIDENTIAL: internal revenue figure $9.2M for the quarter',
      },
    })

    expect(result.signals.map((s) => s.id)).toContain('sensitive_tool_result_exfiltration')
    expect(result.level).toBe('high')
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
  })

  // Untrusted source accessing secrets → critical escalation
  it('escalates secret access to critical when instruction comes from untrusted content', () => {
    const result = assess('dump_credentials', { instructionSource: 'webpage' })

    const sig = result.signals.find((s) => s.id === 'secret_access_attempt')
    expect(sig?.severity).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
  })

  // Physical action in safe context → no emergency signal
  it('does not flag physical actions when context is safe', () => {
    const result = assess('unlock_door', { ownerPresent: true })

    expect(result.signals.map((s) => s.id)).not.toContain('physical_safety_emergency')
  })

  // Clear case: no signals, no anomalies
  it('returns clear assessment for benign low-blast actions', () => {
    const result = assess('read_public_blog_post', { instructionSource: 'user_message' })

    expect(result.level).toBe('clear')
    expect(result.requiredDecision).toBeUndefined()
    expect(result.automaticResponse).toHaveLength(0)
    expect(result.score).toBe(0)
  })

  // Score floor: high blast radius raises score minimum
  it('lifts score to minimum 40 for high blast radius even with no other signals', () => {
    // cancel_payment: IRREVERSIBLE (cancel) + HIGH_VALUE (payment) → blast radius 'high'
    // high_blast_radius signal adds 32pts; blast radius floor enforces min 40.
    const result = assess('cancel_payment')

    expect(result.score).toBeGreaterThanOrEqual(40)
  })

  // Combined signals compound correctly
  it('compounds score across multiple independent signals', () => {
    // unknown device (18) + approval fatigue from anomaly flag (32) = 50 → high
    const result = assess('send_message', { newDevice: true }, ['suspicious_prompt_pattern'])

    expect(result.score).toBeGreaterThanOrEqual(50)
    expect(result.level).toBe('high')
  })
})
