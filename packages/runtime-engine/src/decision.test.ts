import { describe, it, expect } from 'vitest'
import { resolveDecision, decisionReasoningSuffix } from './decision'
import type { ActionPolicy } from '@sanctum-runtime/sdk'

const basePolicy: ActionPolicy = {
  action: 'test.action',
  autoBlock: false,
  requiresVerification: false,
}

describe('resolveDecision', () => {
  it('hard-blocks when autoBlock is on, regardless of other signals', () => {
    expect(
      resolveDecision({
        policy: { ...basePolicy, autoBlock: true },
        risk: 'low',
        modelRecommendation: 'approve',
        anomalyFlags: [],
      }),
    ).toBe('BLOCKED')
  })

  it('approves low-risk safe actions with no anomalies', () => {
    expect(
      resolveDecision({
        policy: basePolicy,
        risk: 'low',
        modelRecommendation: 'approve',
        anomalyFlags: [],
      }),
    ).toBe('APPROVED')
  })

  it('requires verification when policy explicitly demands it', () => {
    expect(
      resolveDecision({
        policy: { ...basePolicy, requiresVerification: true },
        risk: 'low',
        modelRecommendation: 'approve',
        anomalyFlags: [],
      }),
    ).toBe('REQUIRE_VERIFICATION')
  })

  it('escalates suspicious_prompt_pattern to verify (without autoBlock)', () => {
    expect(
      resolveDecision({
        policy: basePolicy,
        risk: 'low',
        modelRecommendation: 'approve',
        anomalyFlags: ['suspicious_prompt_pattern'],
      }),
    ).toBe('REQUIRE_VERIFICATION')
  })

  it('escalates unsafe command chains to verify', () => {
    for (const flag of ['unsafe_command_chain', 'rapid_repeat_action', 'privilege_escalation_chain']) {
      expect(
        resolveDecision({
          policy: basePolicy,
          risk: 'low',
          modelRecommendation: 'approve',
          anomalyFlags: [flag],
        }),
      ).toBe('REQUIRE_VERIFICATION')
    }
  })

  it('autoBlock wins over anomaly flags', () => {
    expect(
      resolveDecision({
        policy: { ...basePolicy, autoBlock: true },
        risk: 'low',
        modelRecommendation: 'approve',
        anomalyFlags: ['unsafe_command_chain'],
      }),
    ).toBe('BLOCKED')
  })

  it('requires verification for high/medium risk by default', () => {
    expect(
      resolveDecision({ policy: basePolicy, risk: 'high', anomalyFlags: [] }),
    ).toBe('REQUIRE_VERIFICATION')
    expect(
      resolveDecision({ policy: basePolicy, risk: 'medium', anomalyFlags: [] }),
    ).toBe('REQUIRE_VERIFICATION')
  })

  it('approves high-risk when model explicitly recommends approve', () => {
    // High risk + model says approve + no policy gate = APPROVED
    // (matches current resolveDecision logic: condition falls through)
    expect(
      resolveDecision({
        policy: basePolicy,
        risk: 'high',
        modelRecommendation: 'approve',
        anomalyFlags: [],
      }),
    ).toBe('APPROVED')
  })
})

describe('decisionReasoningSuffix', () => {
  it('explains a hard block from policy', () => {
    expect(
      decisionReasoningSuffix('BLOCKED', { ...basePolicy, autoBlock: true }),
    ).toContain('Policy Manager')
  })

  it('explains held-for-verification override', () => {
    expect(
      decisionReasoningSuffix('REQUIRE_VERIFICATION', basePolicy, 'block'),
    ).toContain('held for your verification')
  })

  it('returns null when no special case applies', () => {
    expect(decisionReasoningSuffix('APPROVED', basePolicy, 'approve')).toBeNull()
  })
})
