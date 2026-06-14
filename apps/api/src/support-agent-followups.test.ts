import { describe, expect, it } from 'vitest'
import { suggestFollowUps } from './support-agent-followups.js'

describe('suggestFollowUps', () => {
  it('suggests pricing follow-ups for pricing questions', () => {
    const out = suggestFollowUps('What is pricing?', 'Observer is free observe-only.', null)
    expect(out.some((s) => /pricing|observer|enterprise/i.test(s))).toBe(true)
  })

  it('includes human request chip when handoff recommended', () => {
    const out = suggestFollowUps('help', 'answer', {
      recommended: true,
      reason: 'requested',
      label: 'Connect',
      url: 'https://example.com',
      email: 'support@example.com',
    })
    expect(out[0]).toMatch(/human/i)
  })

  it('returns at most 3 suggestions', () => {
    const out = suggestFollowUps('mcp tools', 'mcp security', null)
    expect(out.length).toBeLessThanOrEqual(3)
  })
})
