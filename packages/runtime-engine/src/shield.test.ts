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

describe('assessShield', () => {
  it('blocks attempts to disable security and audit controls', () => {
    const result = assess('disable_security_logging', { instructionSource: 'tool_output' })

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((signal) => signal.id)).toContain('security_control_tamper')
    expect(result.automaticResponse).toContain('block_action')
  })

  it('blocks untrusted requests that attempt to retrieve secrets', () => {
    const result = assess('read_api_key', { instructionSource: 'webpage' })

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((signal) => signal.id)).toContain('secret_access_attempt')
  })

  it('blocks physical actions with lethal or vulnerable context', () => {
    const result = assess('unlock_door', { owner_sleeping: true })

    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((signal) => signal.id)).toContain('physical_safety_emergency')
  })

  it('blocks financial actions whose estimated exposure exceeds the threshold', () => {
    const result = assess('transfer_funds', { amount: 15_000 })

    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((signal) => signal.id)).toContain('critical_financial_exposure')
  })

  it('holds high-risk injection signals for a human decision', () => {
    const result = assess('send_email', {}, ['suspicious_prompt_pattern'])

    expect(result.level).toBe('high')
    expect(result.requiredDecision).toBe('REQUIRE_VERIFICATION')
    expect(result.automaticResponse).toContain('hold_for_review')
  })

  it('escalates repeated blocked requests into containment', () => {
    const result = assess('send_email', {}, [], [
      blockedHistory('2026-05-26T11:58:00Z'),
      blockedHistory('2026-05-26T11:59:00Z'),
    ])

    expect(result.level).toBe('critical')
    expect(result.requiredDecision).toBe('BLOCKED')
    expect(result.signals.map((signal) => signal.id)).toContain('repeated_blocked_attempts')
  })

  it('records an unknown execution environment without prematurely blocking', () => {
    const result = assess('read_calendar', { newDevice: true })

    expect(result.level).toBe('elevated')
    expect(result.requiredDecision).toBeUndefined()
    expect(result.signals.map((signal) => signal.id)).toContain('unknown_device_or_location')
  })
})
