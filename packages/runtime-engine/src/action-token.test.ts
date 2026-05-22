import { describe, expect, it } from 'vitest'
import type { ActionResult } from '@sanctum-runtime/sdk'
import { issueActionToken, verifyActionToken } from './action-token'

function approved(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    id: 'audit-1',
    correlationId: 'corr-1',
    actor: 'agent-1',
    action: 'send_email',
    context: { org_id: 'org-1' },
    decision: 'APPROVED',
    risk: 'low',
    reasoning: 'Approved.',
    policyPath: 'policy.send_email',
    anomalyFlags: [],
    timestamp: new Date().toISOString(),
    offlineMode: false,
    evaluationMode: 'online_model',
    modelInvoked: false,
    ollamaConnected: false,
    ...overrides,
  }
}

describe('action tokens', () => {
  it('issues and verifies a short-lived approval token', () => {
    process.env.SANCTUM_ACTION_TOKEN_SECRET = 'test-action-token-secret'
    const actionToken = issueActionToken(approved({
      actionIdentity: {
        actorId: 'agent-1',
        toolId: 'gmail.send',
        runtimeId: 'runtime-prod-1',
        environmentId: 'prod',
        requestedPermission: 'email:send',
        scope: ['customer@example.com'],
        expiresAt: '2030-01-01T00:00:00.000Z',
        correlationChain: ['audit-parent-1'],
      },
    }), 60)
    expect(actionToken).toBeTruthy()
    const payload = verifyActionToken(actionToken!.token)
    expect(payload?.actor).toBe('agent-1')
    expect(payload?.action).toBe('send_email')
    expect(payload?.orgId).toBe('org-1')
    expect(payload?.toolId).toBe('gmail.send')
    expect(payload?.runtimeId).toBe('runtime-prod-1')
    expect(payload?.environmentId).toBe('prod')
    expect(payload?.requestedPermission).toBe('email:send')
    expect(payload?.scope).toEqual(['customer@example.com'])
    expect(payload?.correlationChain).toEqual(['audit-parent-1'])
    expect(actionToken?.scope.toolId).toBe('gmail.send')
  })

  it('does not issue tokens for blocked actions', () => {
    process.env.SANCTUM_ACTION_TOKEN_SECRET = 'test-action-token-secret'
    expect(issueActionToken(approved({ decision: 'BLOCKED' }))).toBeNull()
  })
})
