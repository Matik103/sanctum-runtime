import { describe, expect, it } from 'vitest'
import { sanitizeReplyForChat } from './support-agent-service.js'

describe('sanitizeReplyForChat', () => {
  it('strips headings and bold markers', () => {
    const raw =
      '### Observer Plan\n\n**Price:** $0\n\n**Agents:** 2\n\nSee [pricing](https://www.sanctumruntime.com/pricing).'
    expect(sanitizeReplyForChat(raw)).toBe(
      'Observer Plan\n\nPrice: $0\n\nAgents: 2\n\nSee [pricing](https://www.sanctumruntime.com/pricing).',
    )
  })
})
