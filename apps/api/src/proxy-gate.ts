/**
 * Connect Agent proxy gate — verify tool calls through the same /v1/actions/verify
 * pipeline as the SDK, optionally waiting for operator approval.
 */
import type { FastifyInstance } from 'fastify'
import type { ActionResult } from '@sanctum-runtime/sdk'
import type { RuntimeEngine } from '@sanctum/runtime-engine'
import type { ConnectOrgSettings } from './connect-settings.js'

export type ProxyToolCall = { id: string; name: string; arguments: string }

export type ToolResultMessage = {
  index: number
  tool_call_id: string
  content: string
  name?: string
}

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

export function proxyWaitVerification(
  req: { headers: Record<string, unknown> },
  defaults?: Pick<ConnectOrgSettings, 'wait_verification'>,
): boolean {
  const raw = req.headers['x-sanctum-wait-verification']
  if (raw === undefined || raw === null || raw === '') {
    return defaults?.wait_verification ?? true
  }
  const v = String(raw).toLowerCase()
  return v !== 'false' && v !== '0'
}

export function resolveProxyMode(
  req: { headers: Record<string, unknown> },
  defaults?: Pick<ConnectOrgSettings, 'proxy_mode'>,
): 'gate' | 'observe' {
  const header = req.headers['x-sanctum-proxy-mode']
  if (header !== undefined && header !== null && header !== '') {
    return String(header).toLowerCase() === 'observe' ? 'observe' : 'gate'
  }
  return defaults?.proxy_mode ?? 'gate'
}

export function proxyGateEnabledFromMode(mode: 'gate' | 'observe'): boolean {
  return mode !== 'observe'
}

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (value.length <= 8) return '••••'
    return `${value.slice(0, 2)}••••${value.slice(-2)}`
  }
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|secret|token|key|api_key|authorization/i.test(k)) {
        out[k] = '••••'
      } else {
        out[k] = redactValue(v)
      }
    }
    return out
  }
  return value
}

export function extractToolResultMessages(body: unknown): ToolResultMessage[] {
  const out: ToolResultMessage[] = []
  if (!body || typeof body !== 'object') return out
  const messages = (body as { messages?: unknown[] }).messages
  if (!Array.isArray(messages)) return out
  messages.forEach((msg, index) => {
    if (!msg || typeof msg !== 'object') return
    const m = msg as { role?: string; tool_call_id?: string; content?: unknown; name?: string }
    if (m.role !== 'tool' || !m.tool_call_id) return
    out.push({
      index,
      tool_call_id: m.tool_call_id,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
      name: m.name,
    })
  })
  return out
}

export function applyToolResultBlocks(
  body: unknown,
  blocked: Map<number, string>,
): unknown {
  if (!body || typeof body !== 'object' || blocked.size === 0) return body
  const parsed = structuredClone(body) as { messages?: Array<Record<string, unknown>> }
  for (const [index, reason] of blocked) {
    const msg = parsed.messages?.[index]
    if (msg) {
      msg.content = `[Sanctum blocked tool result] ${reason}`
    }
  }
  return parsed
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
    phase?: 'proposal' | 'execution' | 'tool_result'
    redactArguments?: boolean
  },
): Promise<GateResult> {
  const phase = opts.phase ?? 'proposal'
  const correlationId = `proxy-${opts.platform}-${phase}-${opts.toolCall.id}`
  const rawArgs = parseArgs(opts.toolCall.arguments)
  const args =
    opts.redactArguments && rawArgs && typeof rawArgs === 'object'
      ? redactValue(rawArgs)
      : rawArgs

  const verifyRes = await app.inject({
    method: 'POST',
    url: '/v1/actions/verify',
    headers: {
      'content-type': 'application/json',
      'x-sanctum-agent-token': opts.agentToken,
    },
    payload: {
      actor: opts.agentName,
      action: phase === 'tool_result' ? 'tool_result' : opts.toolCall.name,
      correlationId,
      context: {
        org_id: opts.orgId,
        proxy: true,
        platform: opts.platform,
        phase,
        tool_call_id: opts.toolCall.id,
        tool_name: opts.toolCall.name !== 'tool_result' ? opts.toolCall.name : undefined,
        arguments: args,
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

  if (verifyRes.statusCode === 402) {
    let detail = 'Plan limit or feature required.'
    try {
      const errBody = JSON.parse(verifyRes.payload as string) as { message?: string; error?: string }
      detail = errBody.message ?? errBody.error ?? detail
    } catch { /* ignore */ }
    return {
      allowed: false,
      entry: {
        ...entry,
        decision: 'BLOCKED',
        reasoning: detail,
        policyPath: 'billing:plan',
      },
      reason: 'plan_limit',
    }
  }

  if (verifyRes.statusCode !== 200) {
    return { allowed: false, entry, reason: 'verification_failed' }
  }

  if (entry.decision === 'BLOCKED' && entry.policyPath === 'billing:governed_quota') {
    return { allowed: false, entry, reason: 'quota_exceeded' }
  }

  if (entry.decision === 'REQUIRE_VERIFICATION' && opts.waitVerification) {
    const deadline = Date.now() + (opts.waitTimeoutMs ?? DEFAULT_WAIT_MS)
    while (Date.now() < deadline) {
      const status = await runtime.getVerificationStatusFresh(correlationId)
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
    waitTimeoutMs?: number
    redactArguments?: boolean
  },
): Promise<{ allowed: ProxyToolCall[]; blocked: Map<string, string> }> {
  const allowed: ProxyToolCall[] = []
  const blocked = new Map<string, string>()

  for (const tc of opts.toolCalls) {
    const result = await gateProxyToolCall(app, runtime, {
      ...opts,
      toolCall: tc,
      phase: 'proposal',
    })
    if (result.allowed) {
      allowed.push(tc)
    } else {
      blocked.set(tc.id, result.reason)
    }
  }

  return { allowed, blocked }
}

export async function gateToolResultsInBody(
  app: FastifyInstance,
  runtime: RuntimeEngine,
  opts: {
    agentToken: string
    agentId: string
    agentName: string
    orgId: string
    platform: string
    body: unknown
    waitVerification: boolean
    waitTimeoutMs?: number
    redactArguments?: boolean
  },
): Promise<{ body: unknown; blocked: Map<number, string> }> {
  const messages = extractToolResultMessages(opts.body)
  const blocked = new Map<number, string>()
  if (messages.length === 0) return { body: opts.body, blocked }

  for (const msg of messages) {
    const result = await gateProxyToolCall(app, runtime, {
      agentToken: opts.agentToken,
      agentId: opts.agentId,
      agentName: opts.agentName,
      orgId: opts.orgId,
      platform: opts.platform,
      waitVerification: opts.waitVerification,
      waitTimeoutMs: opts.waitTimeoutMs,
      redactArguments: opts.redactArguments,
      phase: 'tool_result',
      toolCall: {
        id: msg.tool_call_id,
        name: msg.name ?? 'tool_result',
        arguments: JSON.stringify({ content: msg.content.slice(0, 4000) }),
      },
    })
    if (!result.allowed) {
      blocked.set(msg.index, result.reason)
    }
  }

  return {
    body: applyToolResultBlocks(opts.body, blocked),
    blocked,
  }
}
