/**
 * Proxy routes — let any third-party agent (OpenAI, DeepSeek, Qwen, Kimi, etc.)
 * flow through Sanctum with zero SDK installation.
 *
 * The user sets their agent's base_url to:
 *   https://<sanctum-api>/v1/proxy/<platform>
 * and adds a single header:
 *   X-Sanctum-Agent-Token: sk_agent_...
 *
 * Sanctum forwards every request to the real platform, streams the response
 * back unchanged, and logs all tool calls to audit_events so they appear in
 * the live feed and shield dashboard.
 *
 * Platform API keys may be sent per-request (Authorization header) or stored
 * encrypted per org via Connect Agent (platform_credentials table).
 */

import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from './logger.js'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { verifyAgentToken } from './agent-tokens.js'
import { getPlatformSecret } from './platform-credentials.js'

function publicApiBase(): string {
  return (
    process.env.SANCTUM_PUBLIC_API_URL?.trim() ||
    process.env.SANCTUM_API_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    ''
  ).replace(/\/$/, '')
}

const log = logger.child({ module: 'proxy-routes' })

// Platform → upstream base URL (includes /v1 so the SDK path is appended correctly)
export const PROXY_PLATFORMS: Record<string, string> = {
  openai:   'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi:     'https://api.moonshot.cn/v1',
  doubao:   'https://ark.cn-beijing.volces.com/api/v3',
  gemini:   'https://generativelanguage.googleapis.com/v1beta/openai',
}

type ToolCall = { id: string; name: string; arguments: string }

function parseArgs(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw }
}

// Extract tool calls from one or more SSE chunks (streaming response)
function toolsFromChunk(chunk: string): ToolCall[] {
  const out: ToolCall[] = []
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
      // not valid JSON — skip
    }
  }
  return out
}

// Extract tool calls from a complete non-streaming response body
function toolsFromBody(body: unknown): ToolCall[] {
  const out: ToolCall[] = []
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

const SKIP_HEADERS = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-length'])

export function registerProxyRoutes(app: FastifyInstance): void {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  // GET /v1/proxy/platforms — list supported platforms + their proxy URLs
  app.get('/v1/proxy/platforms', async (_req, reply) => {
    const base = publicApiBase()
    return reply.send({
      platforms: Object.entries(PROXY_PLATFORMS).map(([id]) => ({
        id,
        proxyUrl: base ? `${base}/v1/proxy/${id}` : `/v1/proxy/${id}`,
        instructions: `Set base_url = <proxyUrl> and add header X-Sanctum-Agent-Token: <your-agent-token>`,
      })),
    })
  })

  // Handle all methods for all paths under /v1/proxy/:platform/
  for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
    app[method]<{ Params: { platform: string; '*': string } }>(
      '/v1/proxy/:platform/*',
      async (req: FastifyRequest<{ Params: { platform: string; '*': string } }>, reply) => {
        const { platform } = req.params
        const subpath = req.params['*'] ?? ''

        // ── Auth via Sanctum agent token ─────────────────────────────────────
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

        // ── Platform routing ─────────────────────────────────────────────────
        const baseUrl = PROXY_PLATFORMS[platform]
        if (!baseUrl) {
          return reply.code(400).send({
            error: `Unknown platform "${platform}"`,
            supported: Object.keys(PROXY_PLATFORMS),
          })
        }

        // Platform API key: per-request header, or org-stored credential from Connect
        let platformAuth = req.headers['authorization'] as string | undefined
        if (!platformAuth) {
          const stored = await getPlatformSecret(cfg, orgId, platform)
          if (stored) platformAuth = `Bearer ${stored}`
        }
        if (!platformAuth) {
          return reply.code(400).send({
            error: 'Authorization header with platform API key required',
            hint: 'Set Authorization: Bearer <your-platform-api-key>, or save the key in Connect Agent.',
          })
        }

        // ── Build + send upstream request ────────────────────────────────────
        const qs = new URLSearchParams(req.query as Record<string, string>).toString()
        const upstreamUrl = `${baseUrl}/${subpath}${qs ? `?${qs}` : ''}`

        const forwardHeaders: Record<string, string> = {
          'content-type': (req.headers['content-type'] as string | undefined) ?? 'application/json',
          authorization: platformAuth,
        }

        let upstream: Response
        try {
          upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers: forwardHeaders,
            body:
              req.method !== 'GET' && req.method !== 'HEAD'
                ? JSON.stringify(req.body)
                : undefined,
          })
        } catch (err) {
          log.error({ err, platform, orgId, upstreamUrl }, 'upstream request failed')
          return reply.code(502).send({ error: 'Upstream platform unreachable', platform })
        }

        // ── Mirror response headers ──────────────────────────────────────────
        const replyHeaders: Record<string, string> = {}
        for (const [k, v] of upstream.headers.entries()) {
          if (!SKIP_HEADERS.has(k.toLowerCase())) replyHeaders[k] = v
        }

        // ── Tool call logger (fire-and-forget) ───────────────────────────────
        const admin = createSupabaseAdmin(cfg)
        function logToolCall(tc: ToolCall): void {
          const correlationId = `proxy-${platform}-${tc.id}`
          void admin
            .from('audit_events')
            .insert({
              id: randomUUID(),
              correlation_id: correlationId,
              org_id: orgId,
              action: tc.name,
              actor: agentId,
              decision: 'APPROVED',
              risk: 'low',
              reasoning: `Observed tool call via ${platform} proxy (Connect Agent).`,
              context: {
                proxy: true,
                platform,
                tool_call_id: tc.id,
                arguments: parseArgs(tc.arguments),
                org_id: orgId,
              },
              payload: {},
            })
            .then(({ error }) => {
              if (error) log.warn({ err: error.message, orgId, tool: tc.name }, 'proxy tool call log failed')
            })
        }

        // ── Streaming (SSE) response ─────────────────────────────────────────
        const isSSE = upstream.headers.get('content-type')?.includes('text/event-stream')
        if (isSSE && upstream.body) {
          reply.raw.writeHead(upstream.status, {
            ...replyHeaders,
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'x-accel-buffering': 'no',
          })

          const reader = upstream.body.getReader()
          const dec = new TextDecoder()
          const seenIds = new Set<string>()

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk = dec.decode(value, { stream: true })
              reply.raw.write(chunk)

              for (const tc of toolsFromChunk(chunk)) {
                if (!seenIds.has(tc.id)) {
                  seenIds.add(tc.id)
                  logToolCall(tc)
                }
              }
            }
          } catch (err) {
            log.warn({ err, orgId, platform }, 'proxy stream interrupted')
          } finally {
            reply.raw.end()
          }
          return reply
        }

        // ── Non-streaming response ───────────────────────────────────────────
        const body = await upstream.json().catch(() => null)
        for (const tc of toolsFromBody(body)) logToolCall(tc)

        void reply.code(upstream.status)
        for (const [k, v] of Object.entries(replyHeaders)) void reply.header(k, v)
        return reply.send(body)
      },
    )
  }
}
