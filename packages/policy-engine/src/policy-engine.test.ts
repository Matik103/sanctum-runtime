import { describe, it, expect } from 'vitest'
import { PolicyEngine } from './index.js'
import type { ActionRequest } from '@sanctum-runtime/sdk'

function req(action: string, actor = 'agent-1', context: Record<string, unknown> = {}): ActionRequest {
  return { actor, action, context }
}

describe('PolicyEngine.evaluate', () => {
  it('returns default policy with no violations for unknown action', () => {
    const e = new PolicyEngine({})
    const r = e.evaluate(req('totally_new_action'), false)
    expect(r.violations).toEqual([])
    expect(r.policyPath).toBe('policy.totally_new_action')
  })

  it('flags policy_auto_block when policy has autoBlock', () => {
    const e = new PolicyEngine({
      'dangerous.op': { autoBlock: true, requiresVerification: false, blockWhenOffline: false },
    })
    const r = e.evaluate(req('dangerous.op'), false)
    expect(r.violations).toContain('policy_auto_block')
  })

  it('flags policy_block_when_offline only when offline', () => {
    const e = new PolicyEngine({
      'risky.op': { blockWhenOffline: true, autoBlock: false, requiresVerification: false },
    })
    expect(e.evaluate(req('risky.op'), true).violations).toContain('policy_block_when_offline')
    expect(e.evaluate(req('risky.op'), false).violations).not.toContain('policy_block_when_offline')
  })

  it('flags policy_actor_not_allowed for non-allowlisted actors', () => {
    const e = new PolicyEngine({
      'shared.op': {
        autoBlock: false,
        requiresVerification: false,
        blockWhenOffline: false,
        allowedActors: ['trusted-agent'],
      },
    })
    expect(e.evaluate(req('shared.op', 'random-agent'), false).violations)
      .toContain('policy_actor_not_allowed')
    expect(e.evaluate(req('shared.op', 'trusted-agent'), false).violations)
      .not.toContain('policy_actor_not_allowed')
  })
})

describe('PolicyEngine — conditional policies', () => {
  it('triggers block result when a condition matches', () => {
    const e = new PolicyEngine({
      'transfer_funds': {
        autoBlock: false,
        requiresVerification: false,
        blockWhenOffline: false,
        conditions: [{ field: 'context.amount', op: 'gt', value: 1000, result: 'block' }],
      },
    })
    const r = e.evaluate(req('transfer_funds', 'a', { amount: 5000 }), false)
    expect(r.policy.autoBlock).toBe(true)
    expect(r.violations).toContain('condition_auto_block')
    expect(r.policyPath).toContain('condition[context.amount gt 1000]')
  })

  it('triggers verify result with requiresVerification=true', () => {
    const e = new PolicyEngine({
      'send_email': {
        autoBlock: false,
        requiresVerification: false,
        blockWhenOffline: false,
        conditions: [{ field: 'context.recipient', op: 'contains', value: 'external', result: 'verify' }],
      },
    })
    const r = e.evaluate(req('send_email', 'a', { recipient: 'external-vendor@example.com' }), false)
    expect(r.policy.requiresVerification).toBe(true)
    expect(r.policy.autoBlock).toBe(false)
  })

  it('skips conditions that do not match', () => {
    const e = new PolicyEngine({
      'transfer_funds': {
        autoBlock: false,
        requiresVerification: false,
        blockWhenOffline: false,
        conditions: [{ field: 'context.amount', op: 'gt', value: 1000, result: 'block' }],
      },
    })
    const r = e.evaluate(req('transfer_funds', 'a', { amount: 50 }), false)
    expect(r.policy.autoBlock).toBe(false)
    expect(r.violations).not.toContain('condition_auto_block')
  })

  it.each([
    ['eq', 'foo', 'foo', true],
    ['eq', 'foo', 'bar', false],
    ['neq', 'foo', 'bar', true],
    ['contains', 'hello world', 'world', true],
    ['startsWith', 'hello', 'he', true],
    ['endsWith', 'hello.txt', '.txt', true],
    ['gt', 100, 50, true],
    ['gte', 50, 50, true],
    ['lt', 10, 50, true],
    ['lte', 50, 50, true],
    ['matches', 'order-12345', '^order-\\d+$', true],
  ] as const)('condition op %s: %j vs %j -> %s', (op, value, target, expected) => {
    const e = new PolicyEngine({
      'test.op': {
        autoBlock: false,
        requiresVerification: false,
        blockWhenOffline: false,
        conditions: [{ field: 'context.v', op, value: target, result: 'block' }],
      },
    })
    const r = e.evaluate(req('test.op', 'a', { v: value }), false)
    expect(r.policy.autoBlock).toBe(expected)
  })
})

describe('PolicyEngine — org-scoped policy resolution', () => {
  it('prefers org-scoped key when org_id is in context', () => {
    const e = new PolicyEngine({
      'org-7:send_email': { autoBlock: true, requiresVerification: false, blockWhenOffline: false },
      'send_email': { autoBlock: false, requiresVerification: false, blockWhenOffline: false },
    })
    const r = e.evaluate(req('send_email', 'a', { org_id: 'org-7' }), false)
    expect(r.violations).toContain('policy_auto_block')
    expect(r.policyPath).toBe('policy.org-7.send_email')
  })

  it('falls back to global key when org-scoped policy not defined', () => {
    const e = new PolicyEngine({
      'send_email': { autoBlock: true, requiresVerification: false, blockWhenOffline: false },
    })
    const r = e.evaluate(req('send_email', 'a', { org_id: 'org-7' }), false)
    expect(r.violations).toContain('policy_auto_block')
    expect(r.policyPath).toBe('policy.send_email')
  })
})

describe('PolicyEngine — CRUD', () => {
  it('updates an existing policy', async () => {
    const e = new PolicyEngine({})
    await e.createPolicy('new.action', { autoBlock: true })
    expect(e.getPolicies()['new.action']?.autoBlock).toBe(true)
    await e.updatePolicy('new.action', { autoBlock: false, requiresVerification: true })
    expect(e.getPolicies()['new.action']).toMatchObject({ autoBlock: false, requiresVerification: true })
  })

  it('deletePolicy removes the entry', async () => {
    const e = new PolicyEngine({})
    await e.createPolicy('temp.op', { autoBlock: true })
    expect(e.getPolicies()['temp.op']).toBeDefined()
    await e.deletePolicy('temp.op')
    expect(e.getPolicies()['temp.op']).toBeUndefined()
  })

  it('forgetPolicy removes from memory only', () => {
    const e = new PolicyEngine({ 'mem.op': { autoBlock: true, requiresVerification: false, blockWhenOffline: false } })
    e.forgetPolicy('mem.op')
    expect(e.getPolicies()['mem.op']).toBeUndefined()
  })
})
