import { afterEach, describe, expect, it, vi } from 'vitest'
import { SanctumClient } from './client'

describe('SanctumClient agent token authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a registered agent token when verifying actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ decision: 'APPROVED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new SanctumClient({
      baseUrl: 'https://api.example.test',
      agentToken: 'sk_agent_registered',
    })

    await client.verifyAction({ actor: 'agent:test', action: 'send_email', context: {} })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Agent-Token': 'sk_agent_registered' }),
    })
  })

  it('prefers the agent token over a workspace API key for action verification', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ decision: 'APPROVED' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new SanctumClient({
      baseUrl: 'https://api.example.test',
      apiKey: 'sk_sanctum_workspace',
      agentToken: 'sk_agent_registered',
    })

    await client.verifyAction({ actor: 'agent:test', action: 'read_record', context: {} })

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Agent-Token': 'sk_agent_registered' }),
    })
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty('X-Sanctum-Key')
  })

  it('keeps using a workspace API key for control-plane requests when both are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = new SanctumClient({
      baseUrl: 'https://api.example.test',
      apiKey: 'sk_sanctum_workspace',
      agentToken: 'sk_agent_registered',
    })

    await client.getPolicies()

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Sanctum-Key': 'sk_sanctum_workspace' }),
    })
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty('X-Agent-Token')
  })
})
