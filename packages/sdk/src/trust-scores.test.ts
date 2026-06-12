import { describe, expect, it } from 'vitest'
import { computeBehavioralTrustScore } from './trust-scores.js'

const now = new Date('2026-06-12T12:00:00.000Z').getTime()

function entry(
  decision: string,
  extra: Partial<{ flags: string[]; shield: number; minutesAgo: number }> = {},
) {
  const minutesAgo = extra.minutesAgo ?? 30
  return {
    decision,
    anomalyFlags: extra.flags ?? [],
    shield_score: extra.shield ?? null,
    timestamp: new Date(now - minutesAgo * 60_000).toISOString(),
  }
}

describe('computeBehavioralTrustScore', () => {
  it('returns null with no entries', () => {
    expect(computeBehavioralTrustScore([], { now })).toBeNull()
  })

  it('returns high score for clean approvals', () => {
    const score = computeBehavioralTrustScore(
      Array.from({ length: 20 }, () => entry('APPROVED')),
      { now },
    )
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThanOrEqual(95)
  })

  it('does not floor at 12% for mixed blocked and held traffic', () => {
    const mixed = [
      ...Array.from({ length: 40 }, () => entry('APPROVED')),
      ...Array.from({ length: 30 }, () => entry('REQUIRE_VERIFICATION')),
      ...Array.from({ length: 30 }, () => entry('BLOCKED', { shield: 55 })),
    ]
    const score = computeBehavioralTrustScore(mixed, { now })
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThan(12)
    expect(score!).toBeLessThan(75)
  })

  it('penalizes high shield scores on risky actions', () => {
    const risky = Array.from({ length: 10 }, () =>
      entry('BLOCKED', { shield: 85 }),
    )
    const safer = Array.from({ length: 10 }, () =>
      entry('BLOCKED', { shield: 20 }),
    )
    const riskyScore = computeBehavioralTrustScore(risky, { now })!
    const saferScore = computeBehavioralTrustScore(safer, { now })!
    expect(saferScore).toBeGreaterThan(riskyScore)
  })
})
