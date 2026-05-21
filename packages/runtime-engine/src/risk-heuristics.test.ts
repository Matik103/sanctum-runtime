import { describe, it, expect } from 'vitest'
import { heuristicRiskFloor, mergeRisk, heuristicRiskReason } from './risk-heuristics'
import type { ActionRequest } from '@sanctum-runtime/sdk'

function req(action: string, context: Record<string, unknown> = {}): ActionRequest {
  return { actor: 'agent-1', action, context }
}

describe('heuristicRiskFloor', () => {
  it('returns low when no anomalies', () => {
    expect(heuristicRiskFloor(req('send_email'), [])).toBe('low')
  })

  it('promotes unsafe_command_chain and suspicious_prompt_pattern to high', () => {
    expect(heuristicRiskFloor(req('any'), ['unsafe_command_chain'])).toBe('high')
    expect(heuristicRiskFloor(req('any'), ['suspicious_prompt_pattern'])).toBe('high')
  })

  it('unlock_door is high when owner asleep at unusual time', () => {
    expect(
      heuristicRiskFloor(req('unlock_door'), ['unusual_time_access', 'owner_absent_or_sleeping']),
    ).toBe('high')
  })

  it('unlock_door is high with either time OR owner-absence signal', () => {
    expect(heuristicRiskFloor(req('unlock_door'), ['unusual_time_access'])).toBe('high')
    expect(heuristicRiskFloor(req('unlock_door'), ['owner_absent_or_sleeping'])).toBe('high')
  })

  it('disable_alarm and transfer_funds escalate on any flag', () => {
    expect(heuristicRiskFloor(req('disable_alarm'), ['unusual_time_access'])).toBe('high')
    expect(heuristicRiskFloor(req('transfer_funds'), ['high_value_transfer'])).toBe('high')
  })

  it('high_value_transfer is high regardless of action', () => {
    expect(heuristicRiskFloor(req('any_action'), ['high_value_transfer'])).toBe('high')
  })

  it('any other flag yields medium', () => {
    expect(heuristicRiskFloor(req('send_email'), ['unusual_time_access'])).toBe('medium')
  })
})

describe('mergeRisk', () => {
  it('returns the more severe of two risks', () => {
    expect(mergeRisk('low', 'high')).toBe('high')
    expect(mergeRisk('medium', 'low')).toBe('medium')
    expect(mergeRisk('high', 'medium')).toBe('high')
    expect(mergeRisk('low', 'low')).toBe('low')
  })
})

describe('heuristicRiskReason', () => {
  it('returns null for low floor', () => {
    expect(heuristicRiskReason(req('x'), [], 'low')).toBeNull()
  })

  it('produces a specific message for door+night+owner-absent', () => {
    const msg = heuristicRiskReason(
      req('unlock_door'),
      ['unusual_time_access', 'owner_absent_or_sleeping'],
      'high',
    )
    expect(msg).toMatch(/physical access/i)
    expect(msg).toMatch(/night|asleep/i)
  })

  it('falls back to generic message with flags listed', () => {
    const msg = heuristicRiskReason(req('any'), ['unusual_time_access'], 'medium')
    expect(msg).toMatch(/Heuristic minimum risk: medium/)
    expect(msg).toMatch(/unusual_time_access/)
  })
})
