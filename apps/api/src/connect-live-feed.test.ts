import { describe, expect, it } from 'vitest'
import { normalizeConnectProxyRow } from './connect-live-feed.js'

describe('normalizeConnectProxyRow', () => {
  it('returns null for non-proxy audit rows', () => {
    expect(normalizeConnectProxyRow({ id: '1', context: {} })).toBeNull()
  })

  it('normalizes proxy tool call events', () => {
    const row = normalizeConnectProxyRow({
      id: 'evt-1',
      org_id: 'org-1',
      action: 'send_email',
      actor: 'agent-abc',
      decision: 'REQUIRE_VERIFICATION',
      correlation_id: 'corr-1',
      context: {
        proxy: true,
        platform: 'openai',
        agent_id: 'agent-abc',
        agent_name: 'Ops Bot',
        tool_call_id: 'tc-1',
        arguments: { to: 'a@b.com' },
      },
      created_at: '2026-05-30T12:00:00.000Z',
    })
    expect(row).toMatchObject({
      id: 'evt-1',
      org_id: 'org-1',
      action: 'send_email',
      decision: 'REQUIRE_VERIFICATION',
      correlation_id: 'corr-1',
      context: {
        proxy: true,
        platform: 'openai',
        agent_id: 'agent-abc',
        agent_name: 'Ops Bot',
        tool_call_id: 'tc-1',
      },
    })
  })

  it('reads blastRadius and sourceTrust from audit payload jsonb', () => {
    const row = normalizeConnectProxyRow({
      id: 'evt-2',
      org_id: 'org-1',
      action: 'transfer_funds',
      actor: 'agent-1',
      decision: 'REQUIRE_VERIFICATION',
      context: { proxy: true, platform: 'openai', tool_call_id: 'tc-2' },
      payload: {
        blastRadius: { level: 'high', score: 72, factors: ['external destination'] },
        sourceTrust: 'tool_output',
        actionIdentity: { toolId: 'transfer_funds' },
      },
      created_at: '2026-06-12T00:00:00.000Z',
    })
    expect(row?.blastRadius).toMatchObject({ level: 'high', score: 72 })
    expect(row?.sourceTrust).toBe('tool_output')
    expect(row?.actionIdentity).toMatchObject({ toolId: 'transfer_funds' })
  })
})
