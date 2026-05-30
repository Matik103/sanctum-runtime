/**
 * Connect Agent proxy gate — verify tool calls through the same /v1/actions/verify
 * pipeline as the SDK, optionally waiting for operator approval.
 */
import type { FastifyInstance } from 'fastify'
import type { ActionResult } from '@sanctum-runtime/sdk'
import type { RuntimeEngine } from '@sanctum/runtime-engine'

export type ProxyToolCall = { id: string; name: string; arguments: string }

export type GateResult =
  | { allowed: true; entry: ActionResult }
  | { allowed: false; entry: ActionResult; reason: string }

const DEFAULT_WAIT_MS = 120_000
const POLL_MS = 2_000

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function proxyGateEnabled(req: { headers: Record<string, unknown> }): boolean {
  const mode = String(req.headers['x-sanctum-proxy-mode'] ?? 'gate').toLowerCase()
  return mode !== 'observe'
}

export function proxyWaitVerification(req: { headers: Record<string, unknown> }): boolean {
  const raw = req.headers['x-sanctum-wait-verification']
  if (raw === undefined || raw === null || raw === '') return true
  const v = String(raw).toLowerCase()
  return v !== 'false' && v !== '0'
}

export async function gateProxyToolCall(
  app: FastifyInstance,
  runtime: RuntimeEngine,
  opts: {
    agentToken: string
    agentId: string
    agentName: string
    orgId: string
    platform: string
    toolCall: ProxyToolCall
    waitVerification: boolean
    waitTimeoutMs?: number
  },
): Promise<GateResult> {
  const correlationId = `proxy-${opts.platform}-${opts.toolCall.id}`

  const verifyRes = await app.inject({
    method: 'POST',
    url: '/v1/actions/verify',
    headers: {
      'content-type': 'application/json',
      'x-sanctum-agent-token': opts.agentToken,
    },
    payload: {
      actor: opts.agentName,
      action: opts.toolCall.name,
      correlationId,
      context: {
        org_id: opts.orgId,
        proxy: true,
        platform: opts.platform,
        tool_call_id: opts.toolCall.id,
        arguments: parseArgs(opts.toolCall.arguments),
        agent_id: opts.agentId,
        agent_name: opts.agentName,
      },
    },
  })

  let entry: ActionResult
  try {
    entry = JSON.parse(verifyRes.payload as string) as ActionResult
  } catch {
    return {
      allowed: false,
      entry: {
        id: correlationId,
        correlationId,
        actor: opts.agentName,
        action: opts.toolCall.name,
        context: {},
        decision: 'BLOCKED',
        risk: 'high',
        reasoning: 'Sanctum verification failed.',
        timestamp: new Date().toISOString(),
      },
      reason: 'verification_failed',
    }
  }

  if (verifyRes.statusCode !== 200) {
    return { allowed: false, entry, reason: 'verification_failed' }
  }

  if (entry.decision === 'REQUIRE_VERIFICATION' && opts.waitVerification) {
    const deadline = Date.now() + (opts.waitTimeoutMs ?? DEFAULT_WAIT_MS)
    while (Date.now() < deadline) {
      const status = runtime.getVerificationStatus(correlationId)
      if (status.status === 'approved' && status.entry) {
        entry = status.entry
        break
      }
      if (status.status === 'blocked' && status.entry) {
        entry = status.entry
        break
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }

  if (entry.decision === 'APPROVED') {
    return { allowed: true, entry }
  }

  const reason =
    entry.decision === 'BLOCKED'
      ? entry.reasoning ?? 'Action blocked by Sanctum policy.'
      : entry.decision === 'REQUIRE_VERIFICATION'
        ? 'Action requires operator approval in the Sanctum dashboard (verification timed out or still pending).'
        : 'Action not approved.'

  return { allowed: false, entry, reason }
}

/** Remove blocked tool calls from an OpenAI-style chat completion body. */
export function filterBlockedToolCallsFromBody(
  body: unknown,
  blocked: Map<string, string>,
): unknown {
  if (!body || typeof body !== 'object' || blocked.size === 0) return body
  const parsed = structuredClone(body) as {
    choices?: Array<{
      message?: {
        role?: string
        content?: string | null
        tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>
      }
      finish_reason?: string | null
    }>
  }

  const notes: string[] = []
  for (const choice of parsed.choices ?? []) {
    const msg = choice.message
    if (!msg?.tool_calls?.length) continue
    const kept = msg.tool_calls.filter((tc) => {
      const id = tc.id ?? ''
      if (blocked.has(id)) {
        notes.push(blocked.get(id) ?? `Tool call ${id} blocked by Sanctum.`)
        return false
      }
      return true
    })
    msg.tool_calls = kept
    if (kept.length === 0) {
      choice.finish_reason = 'stop'
      const prefix = msg.content?.trim() ? `${msg.content.trim()}\n\n` : ''
      msg.content = `${prefix}${notes.join('\n')}`
    }
  }
  return parsed
}

/** Reconstruct SSE from buffered chunks, dropping blocked tool-call deltas. */
export function filterBlockedToolCallsFromSse(
  sseText: string,
  blocked: Map<string, string>,
): string {
  if (blocked.size === 0) return sseText

  const blockedIds = new Set(blocked.keys())
  const lines = sseText.split('\n')
  const out: string[] = []
  let noteAppended = false

  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      out.push(line)
      continue
    }
    const data = line.slice(6).trim()
    if (data === '[DONE]') {
      out.push(line)
      continue
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
          }
          finish_reason?: string | null
        }>
      }
      let drop = false
      for (const choice of parsed.choices ?? []) {
        const deltas = choice.delta?.tool_calls ?? []
        for (const tc of deltas) {
          if (tc.id && blockedIds.has(tc.id)) drop = true
        }
        if (drop) {
          choice.delta = { content: undefined, tool_calls: [] }
          choice.finish_reason = 'stop'
        }
      }
      if (drop) {
        if (!noteAppended) {
          const note = [...blocked.values()].join(' ')
          out.push(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n${note}` }, finish_reason: 'stop' }] })}`)
          noteAppended = true
        }
        continue
      }
      out.push(`data: ${JSON.stringify(parsed)}`)
    } catch {
      out.push(line)
    }
  }
  return out.join('\n')
}

export async function gateToolCalls(
  app: FastifyInstance,
  runtime: RuntimeEngine,
  opts: {
    agentToken: string
    agentId: string
    agentName: string
    orgId: string
    platform: string
    toolCalls: ProxyToolCall[]
    waitVerification: boolean
  },
): Promise<{ allowed: ProxyToolCall[]; blocked: Map<string, string> }> {
  const allowed: ProxyToolCall[] = []
  const blocked = new Map<string, string>()

  for (const tc of toolCalls) {
    const result = await gateProxyToolCall(app, runtime, { ...opts, toolCall: tc })
    if (result.allowed) {
      allowed.push(tc)
    } else {
      blocked.set(tc.id, result.reason)
    }
  }

  return { allowed, blocked }
}
