import { describe, expect, it } from 'vitest'
import { RuntimeEngine } from './index'

describe('fail-safe for unconfigured actions', () => {
  it('holds an unconfigured action for verification when the risk model is unavailable', async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true })
    const result = await runtime.verifyAction({
      actor: 'agent-1',
      action: 'frobnicate_widget_9000',
      context: { org_id: 'org-1' },
    })
    // No policy configured for this action AND no risk model assessment ⇒ must
    // never silently approve. Held for human verification (fail-safe).
    expect(result.decision).toBe('REQUIRE_VERIFICATION')
    expect(result.anomalyFlags).toContain('unconfigured_action_unassessed')
  })

  it('still auto-approves a configured low-risk action offline (no false positives)', async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true })
    const result = await runtime.verifyAction({
      actor: 'agent-1',
      action: 'send_email',
      context: { org_id: 'org-1', to: 'ops@example.com' },
    })
    expect(result.decision).toBe('APPROVED')
    expect(result.anomalyFlags).not.toContain('unconfigured_action_unassessed')
  })
})

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
