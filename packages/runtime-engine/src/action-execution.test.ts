import { describe, expect, it } from 'vitest'
import { RuntimeEngine } from './index'

describe('action execution reporting', () => {
  it('records executor outcome when signed action token matches audit entry', async () => {
    process.env.SANCTUM_ACTION_TOKEN_SECRET = 'test-action-token-secret'
    const runtime = new RuntimeEngine({ forceOfflineMode: true })
    const approved = await runtime.verifyAction({
      actor: 'agent-1',
      action: 'send_email',
      context: { org_id: 'org-1', to: 'ops@example.com' },
    })

    expect(approved.decision).toBe('APPROVED')
    expect(approved.actionToken?.token).toBeTruthy()

    const updated = await runtime.reportActionExecution(approved.id, {
      actionToken: approved.actionToken!.token,
      status: 'succeeded',
      reportedBy: 'gmail.executor',
      resultSummary: 'Email sent to ops@example.com',
      durationMs: 42,
    })

    expect(updated?.execution).toMatchObject({
      status: 'succeeded',
      reportedBy: 'gmail.executor',
      resultSummary: 'Email sent to ops@example.com',
      durationMs: 42,
    })
  })

  it('rejects execution reports with invalid action tokens', async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true })
    await expect(runtime.reportActionExecution('audit-1', {
      actionToken: 'not-a-token',
      status: 'failed',
    })).rejects.toThrow('invalid_action_token')
  })
})
