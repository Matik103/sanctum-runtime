import { describe, expect, it } from 'vitest'
import {
  filterBlockedToolCallsFromBody,
  filterBlockedToolCallsFromSse,
} from './proxy-gate.js'

describe('proxy gate response filtering', () => {
  it('removes blocked tool calls from chat completion body', () => {
    const body = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_a', type: 'function', function: { name: 'send_email', arguments: '{}' } },
              { id: 'call_b', type: 'function', function: { name: 'delete_db', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    }
    const blocked = new Map([['call_b', 'Blocked by policy.']])
    const out = filterBlockedToolCallsFromBody(body, blocked) as typeof body
    expect(out.choices[0].message.tool_calls).toHaveLength(1)
    expect(out.choices[0].message.tool_calls![0].id).toBe('call_a')
  })

  it('replaces all tool calls with block message when every call blocked', () => {
    const body = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_a', type: 'function', function: { name: 'send_email', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    }
    const blocked = new Map([['call_a', 'Blocked by Sanctum.']])
    const out = filterBlockedToolCallsFromBody(body, blocked) as typeof body
    expect(out.choices[0].message.tool_calls).toHaveLength(0)
    expect(out.choices[0].message.content).toContain('Blocked by Sanctum')
    expect(out.choices[0].finish_reason).toBe('stop')
  })

  it('filters blocked tool call ids from SSE buffer', () => {
    const sse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_x","function":{"name":"a","arguments":"{}"}}]}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const blocked = new Map([['call_x', 'Held for review.']])
    const out = filterBlockedToolCallsFromSse(sse, blocked)
    expect(out).not.toContain('call_x')
    expect(out).toContain('Held for review')
  })
})
