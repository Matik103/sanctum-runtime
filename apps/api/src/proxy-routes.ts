/**
 * Proxy routes — third-party agents (OpenAI, DeepSeek, etc.) through Sanctum.
 *
 * Default mode (`gate`): each tool call in the model response is verified via
 * POST /v1/actions/verify (same path as the SDK) before the client receives it.
 * Set header X-Sanctum-Proxy-Mode: observe for legacy log-only behavior.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from './logger.js'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { verifyAgentToken } from './agent-tokens.js'
import { getPlatformSecret } from './platform-credentials.js'
import { getConnectSettings } from './connect-settings.js'
import { extractToolsFromChatBody, upsertConnectTool } from './connect-tool-registry.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { getEntitlementEngine } from './entitlements.js'
import {
  assertGovernedQuotaForReply,
  assertObserveQuotaForReply,
  canUseConnectGate,
} from './entitlements-gate.js'
import type { RuntimeEngine } from '@sanctum/runtime-engine'
import {
  filterBlockedToolCallsFromBody,
  filterBlockedToolCallsFromSse,
  gateToolCalls,
  gateToolResultsInBody,
  proxyGateEnabledFromMode,
  proxyWaitVerification,
  resolveProxyMode,
  type ProxyToolCall,
} from './proxy-gate.js'
import { randomUUID } from 'node:crypto'

function publicApiBase(): string {
  return (
    process.env.SANCTUM_PUBLIC_API_URL?.trim() ||
    process.env.SANCTUM_API_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    ''
  ).replace(/\/$/, '')
}

const log = logger.child({ module: 'proxy-routes' })

export const PROXY_PLATFORMS: Record<string, string> = {
  openai:   'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi:     'https://api.moonshot.cn/v1',
  doubao:   'https://ark.cn-beijing.volces.com/api/v3',
  gemini:   'https://generativelanguage.googleapis.com/v1beta/openai',
}

function toolsFromChunk(chunk: string): ProxyToolCall[] {
  const out: ProxyToolCall[] = []
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (data === '[DONE]') continue
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            tool_calls?: Array<{
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
      }
      for (const choice of parsed.choices ?? []) {
        for (const tc of choice.delta?.tool_calls ?? []) {
          if (tc.id && tc.function?.name) {
            out.push({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments ?? '' })
          }
        }
      }
    } catch {
      // skip
    }
  }
  return out
}

function toolsFromBody(body: unknown): ProxyToolCall[] {
  const out: ProxyToolCall[] = []
  try {
    const parsed = body as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            id?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      }>
    }
    for (const choice of parsed.choices ?? []) {
      for (const tc of choice.message?.tool_calls ?? []) {
        if (tc.id && tc.function?.name) {
          out.push({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments ?? '' })
        }
      }
    }
  } catch {
    // ignore
  }
  return out
}

function uniqueToolCalls(calls: ProxyToolCall[]): ProxyToolCall[] {
  const seen = new Set<string>()
  return calls.filter((tc) => {
    if (seen.has(tc.id)) return false
    seen.add(tc.id)
    return true
  })
}

async function readStreamText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let acc = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    acc += dec.decode(value, { stream: true })
  }
  return acc
}

const SKIP_HEADERS = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'content-length',
  'content-encoding',
])

export function registerProxyRoutes(app: FastifyInstance, runtime: RuntimeEngine): void {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  app.get('/v1/proxy/platforms', async (_req, reply) => {
    const base = publicApiBase()
    return reply.send({
      platforms: Object.entries(PROXY_PLATFORMS).map(([id]) => ({
        id,
        proxyUrl: base ? `${base}/v1/proxy/${id}` : `/v1/proxy/${id}`,
        instructions:
          'Set base_url = <proxyUrl>, X-Sanctum-Agent-Token, and optionally save platform key in Connect. Tool calls are gated via /v1/actions/verify by default.',
      })),
    })
  })

  for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
    app[method]<{ Params: { platform: string; '*': string } }>(
      '/v1/proxy/:platform/*',
      async (req: FastifyRequest<{ Params: { platform: string; '*': string } }>, reply) => {
        const { platform } = req.params
        const subpath = req.params['*'] ?? ''

        const agentTokenRaw =
          (req.headers['x-sanctum-agent-token'] as string | undefined) ??
          (req.headers['x-agent-token'] as string | undefined)

        if (!agentTokenRaw) {
          return reply.code(401).send({
            error: 'X-Sanctum-Agent-Token header required',
            hint: 'Get your agent token from the Sanctum console → Connect page',
          })
        }

        const claims = verifyAgentToken(agentTokenRaw)
        if (!claims) {
          return reply.code(401).send({ error: 'Invalid or tampered agent token' })
        }
        const { orgId, id: agentId } = claims
        const admin = createSupabaseAdmin(cfg)
        const { data: agentRow } = await admin
          .from('agent_registrations')
          .select('name')
          .eq('id', agentId)
          .maybeSingle()
        const agentName = agentRow?.name ?? agentId.slice(0, 8)

        const connectSettings = await getConnectSettings(cfg, orgId)
        const entitlements = getEntitlementEngine(cfg)
        const planLimits = await entitlements.getLimits(orgId)
        const proxyMode = resolveProxyMode(req, connectSettings)
        const gateRequested = proxyGateEnabledFromMode(proxyMode)
        const gateEnabled = gateRequested && canUseConnectGate(planLimits)
        if (gateRequested && !gateEnabled) {
          return reply.code(402).send({
            error: 'plan_feature_required',
            feature: 'light_gates',
            currentPlan: planLimits.planId,
            message:
              'Connect gate mode requires Personal or higher. Use observe mode on Developer, or upgrade at /billing.',
          })
        }
        if (gateEnabled) {
          if (!(await assertGovernedQuotaForReply(entitlements, orgId, reply))) return
        } else if (!(await assertObserveQuotaForReply(entitlements, orgId, reply))) return
        const waitVerification = proxyWaitVerification(req, connectSettings)
        const waitTimeoutMs = connectSettings.wait_timeout_ms
        const gateToolResults = connectSettings.gate_tool_results
        const redactArguments = connectSettings.redact_tool_arguments
        const credEnvironment = connectSettings.credential_environment

        const socketTimeout = waitVerification ? waitTimeoutMs + 60_000 : 45_000
        if (req.raw.socket) req.raw.socket.setTimeout(socketTimeout)

        const baseUrl = PROXY_PLATFORMS[platform]
        if (!baseUrl) {
          return reply.code(400).send({
            error: `Unknown platform "${platform}"`,
            supported: Object.keys(PROXY_PLATFORMS),
          })
        }

        let platformAuth = req.headers['authorization'] as string | undefined
        if (!platformAuth) {
          const stored = await getPlatformSecret(cfg, orgId, platform, credEnvironment)
          if (stored) platformAuth = `Bearer ${stored}`
        }
        if (!platformAuth) {
          return reply.code(400).send({
            error: 'Authorization header with platform API key required',
            hint: 'Set Authorization: Bearer <your-platform-api-key>, or save the key in Connect Agent.',
          })
        }

        const qs = new URLSearchParams(req.query as Record<string, string>).toString()
        const upstreamUrl = `${baseUrl}/${subpath}${qs ? `?${qs}` : ''}`

        const forwardHeaders: Record<string, string> = {
          'content-type': (req.headers['content-type'] as string | undefined) ?? 'application/json',
          authorization: platformAuth,
        }

        let requestBody = req.body

        if (req.method === 'POST' && requestBody && typeof requestBody === 'object') {
          for (const tool of extractToolsFromChatBody(requestBody)) {
            void upsertConnectTool(cfg, {
              orgId,
              action: tool.name,
              agentId,
              platform,
              description: tool.description ?? null,
              parametersSchema: tool.parameters ?? null,
            })
          }
        }

        const gateOpts = {
          agentToken: agentTokenRaw,
          agentId,
          agentName,
          orgId,
          platform,
          waitVerification,
          waitTimeoutMs,
          redactArguments,
        }

        if (
          gateEnabled &&
          gateToolResults &&
          req.method === 'POST' &&
          requestBody &&
          typeof requestBody === 'object'
        ) {
          const gated = await gateToolResultsInBody(app, runtime, {
            ...gateOpts,
            body: requestBody,
          })
          requestBody = gated.body
          if (gated.blocked.size > 0) {
            recordUsage(cfg, orgId, UsageMetrics.ACTION_VERIFY, gated.blocked.size, {
              proxy: true,
              phase: 'tool_result',
              platform,
            })
          }
        }

        let upstream: Response
        try {
          upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers: forwardHeaders,
            body:
              req.method !== 'GET' && req.method !== 'HEAD'
                ? JSON.stringify(requestBody)
                : undefined,
          })
        } catch (err) {
          log.error({ err, platform, orgId, upstreamUrl }, 'upstream request failed')
          return reply.code(502).send({ error: 'Upstream platform unreachable', platform })
        }

        const replyHeaders: Record<string, string> = {}
        for (const [k, v] of upstream.headers.entries()) {
          if (!SKIP_HEADERS.has(k.toLowerCase())) replyHeaders[k] = v
        }

        function logObservedToolCalls(toolCalls: ProxyToolCall[]): void {
          if (toolCalls.length > 0) {
            recordUsage(cfg, orgId, UsageMetrics.ACTION_OBSERVE, toolCalls.length, {
              proxy: true,
              phase: 'proposal',
              platform,
            })
          }
          for (const tc of toolCalls) {
            void admin
              .from('audit_events')
              .insert({
                id: randomUUID(),
                correlation_id: `proxy-${platform}-${tc.id}`,
                org_id: orgId,
                action: tc.name,
                actor: agentId,
                decision: 'APPROVED',
                risk: 'low',
                reasoning: 'Observed tool call via Connect proxy (observe mode).',
                context: {
                  proxy: true,
                  platform,
                  agent_id: agentId,
                  agent_name: agentName,
                  tool_call_id: tc.id,
                  arguments: (() => {
                    try { return JSON.parse(tc.arguments) } catch { return tc.arguments }
                  })(),
                  org_id: orgId,
                },
                payload: {},
              })
              .then(({ error }) => {
                if (error) log.warn({ err: error.message, orgId, tool: tc.name }, 'proxy observe log failed')
              })
          }
        }

        const isSSE = upstream.headers.get('content-type')?.includes('text/event-stream')

        if (isSSE && upstream.body) {
          const sseText = await readStreamText(upstream.body)
          let outSse = sseText

          if (gateEnabled) {
            const toolCalls = uniqueToolCalls(toolsFromChunk(sseText))
            if (toolCalls.length > 0) {
              const { blocked } = await gateToolCalls(app, runtime, { ...gateOpts, toolCalls })
              recordUsage(cfg, orgId, UsageMetrics.ACTION_VERIFY, toolCalls.length, {
                proxy: true,
                phase: 'proposal',
                platform,
                blocked: blocked.size,
              })
              if (blocked.size > 0) {
                outSse = filterBlockedToolCallsFromSse(sseText, blocked)
              }
            }
          } else {
            logObservedToolCalls(uniqueToolCalls(toolsFromChunk(sseText)))
          }

          reply.raw.writeHead(upstream.status, {
            ...replyHeaders,
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'x-accel-buffering': 'no',
          })
          reply.raw.write(outSse)
          reply.raw.end()
          return reply
        }

        const body = await upstream.json().catch(() => null)

        if (gateEnabled && body) {
          const toolCalls = uniqueToolCalls(toolsFromBody(body))
          if (toolCalls.length > 0) {
            const { blocked } = await gateToolCalls(app, runtime, { ...gateOpts, toolCalls })
            recordUsage(cfg, orgId, UsageMetrics.ACTION_VERIFY, toolCalls.length, {
              proxy: true,
              phase: 'proposal',
              platform,
              blocked: blocked.size,
            })
            const filtered = filterBlockedToolCallsFromBody(body, blocked)
            void reply.code(upstream.status)
            for (const [k, v] of Object.entries(replyHeaders)) void reply.header(k, v)
            return reply.send(filtered)
          }
        } else if (!gateEnabled && body) {
          logObservedToolCalls(uniqueToolCalls(toolsFromBody(body)))
        }

        void reply.code(upstream.status)
        for (const [k, v] of Object.entries(replyHeaders)) void reply.header(k, v)
        return reply.send(body)
      },
    )
  }
}
