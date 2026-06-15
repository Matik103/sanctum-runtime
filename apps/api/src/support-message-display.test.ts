import { describe, expect, it } from 'vitest'
import { normalizeSupportTranscript } from './support-message-display.js'

describe('normalizeSupportTranscript', () => {
  it('drops consecutive duplicate user lines', () => {
    const out = normalizeSupportTranscript([
      {
        id: 'a',
        role: 'user',
        content: 'hi Alex, I need help',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        role: 'user',
        content: 'hi Alex, I need help',
        created_at: '2026-01-01T00:00:05.000Z',
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('a')
  })

  it('keeps only one operator joined system notice', () => {
    const joined =
      "Alex Rivera joined the conversation. You're in the same thread — no need to repeat yourself."
    const out = normalizeSupportTranscript([
      {
        id: '1',
        role: 'assistant',
        content: joined,
        sender: 'system',
        created_at: '2026-01-01T00:01:00.000Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: joined,
        sender: 'system',
        created_at: '2026-01-01T00:01:02.000Z',
      },
    ])
    expect(out).toHaveLength(1)
  })

  it('hides legacy queue copy after modern handoff confirmation', () => {
    const out = normalizeSupportTranscript([
      {
        id: '1',
        role: 'assistant',
        content:
          "You're with our team now. A specialist is reviewing this conversation and will respond right here.",
        sender: 'system',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'You are in the queue — a Sanctum teammate will join this chat shortly.',
        sender: 'system',
        created_at: '2026-01-01T00:00:01.000Z',
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe('1')
  })
})
