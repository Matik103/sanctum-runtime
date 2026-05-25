import { describe, expect, it, vi } from 'vitest'
import { gateModelToolCall, wrapModelToolExecutor } from './model-tools'

describe('model-tools adapter', () => {
  it('forwards provider identity and arguments to the action gate', async () => {
    const verifyAction = vi.fn().mockResolvedValue({ decision: 'APPROVED' })
    await gateModelToolCall(
      { name: 'send_email', arguments: { to: 'ops@example.com' }, callId: 'call-1' },
      {
        client: { verifyAction } as never,
        provider: 'google-gemini',
        model: 'gemini-2.5-pro',
        agentId: 'gemini:operator',
      },
    )

    expect(verifyAction).toHaveBeenCalledWith(
      {
        actor: 'gemini:operator',
        action: 'send_email',
        context: {
          params: { to: 'ops@example.com' },
          provider: 'google-gemini',
          model: 'gemini-2.5-pro',
          toolCallId: 'call-1',
          instructionSource: 'user',
        },
      },
      {},
    )
  })

  it('executes the original tool only after approval', async () => {
    const sequence: string[] = []
    const client = {
      verifyAction: vi.fn().mockImplementation(async () => {
        sequence.push('verify')
        return { decision: 'APPROVED' }
      }),
    }
    const execute = vi.fn().mockImplementation(async () => {
      sequence.push('execute')
      return 'ok'
    })
    const run = wrapModelToolExecutor(execute, {
      client: client as never,
      provider: 'xai-grok',
    })

    await expect(run({ name: 'post_message' })).resolves.toBe('ok')
    expect(sequence).toEqual(['verify', 'execute'])
  })
})
