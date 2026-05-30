import { describe, expect, it } from 'vitest'

// Mirror normalizeProxyEvent logic from useLiveFeed.ts for unit testing without React.
function normalizeProxyEvent(raw: Record<string, unknown>) {
  const ctx = (raw.context as Record<string, unknown> | undefined) ?? {}
  if (ctx.proxy !== true) return null
  const created =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.timestamp === 'string' && raw.timestamp) ||
    new Date().toISOString()
  return {
    id: String(raw.id ?? 'generated'),
    org_id: String(raw.org_id ?? ctx.org_id ?? ''),
    action: String(raw.action ?? ''),
    actor: String(raw.actor ?? ''),
    decision: String(raw.decision ?? 'APPROVED'),
    context: {
      proxy: true as const,
      platform: String(ctx.platform ?? 'unknown'),
      tool_call_id: String(ctx.tool_call_id ?? ''),
      arguments: ctx.arguments,
    },
    created_at: created,
  }
}

describe('Live Feed proxy event normalization', () => {
  it('accepts audit API rows (timestamp) and Supabase rows (created_at)', () => {
    const fromApi = normalizeProxyEvent({
      id: 'a1',
      org_id: 'org-1',
      action: 'send_email',
      actor: 'agent-1',
      decision: 'APPROVED',
      timestamp: '2026-05-30T20:00:00.000Z',
      context: { proxy: true, platform: 'openai', tool_call_id: 'tc1', arguments: { to: 'x' } },
    })
    expect(fromApi?.created_at).toBe('2026-05-30T20:00:00.000Z')

    const fromRealtime = normalizeProxyEvent({
      id: 'a2',
      org_id: 'org-1',
      action: 'read_metrics',
      actor: 'agent-2',
      decision: 'APPROVED',
      created_at: '2026-05-30T21:00:00.000Z',
      context: { proxy: true, platform: 'deepseek', tool_call_id: 'tc2', arguments: {} },
    })
    expect(fromRealtime?.created_at).toBe('2026-05-30T21:00:00.000Z')
  })

  it('ignores non-proxy audit entries', () => {
    expect(
      normalizeProxyEvent({
        id: 'x',
        action: 'transfer_funds',
        context: { org_id: 'org-1' },
      }),
    ).toBeNull()
  })
})
