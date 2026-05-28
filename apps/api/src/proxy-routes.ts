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
 * back unchanged, extracts tool calls from the response, and logs them to
 * audit_events so they appear in the Live Feed and Shield dashboard.
 *
 * The platform API key travels in the Authorization header and is NEVER stored.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from './logger.js'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { verifyAgentToken } from './agent-tokens.js'

const log = logger.child({ module: 'proxy-routes' })

// Platform → upstream base URL (includes path prefix so SDK appends correctly)
export const PROXY_PLATFORMS: Record<string, string> = {
  openai:   'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen:     'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi:     'https://api.moonshot.cn/v1',
  doubao:   'https://ark.cn-beijing.volces.com/api/v3',
  gemini:   'https://generativelanguage.googleapis.com/v1beta/openai',
}

const UPSTREAM_TIMEOUT_MS = 25_000
const SKIP_HEADERS = new Set(['transfer-encoding', 'connection', 'keep-alive', 'content-length'])

type ToolCall = { id: string; name: string; arguments: string }

function parseArgs(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw }
}

// ── SSE tool-call accumulator ────────────────────────────────────────────────
//
// OpenAI-compatible streaming sends tool calls incrementally — the function
// name arrives in one chunk and arguments trickle in over subsequent chunks.
// We buffer complete SSE frames (delimited by \n\n), accumulate per-index
// tool call data, and only log fully-assembled tool calls at stream end.
//
type InProgressToolCall = { id?: string; name?: string; arguments: string }

function createSseAccumulator() {
  let textBuffer = ''
  const byIndex = new Map<number, InProgressToolCall>()

  function processEventData(data: string): void {
    if (data === '[DONE]') return
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
      }
      for (const choice of parsed.choices ?? []) {
        for (const tc of choice.delta?.tool_calls ?? []) {
          const idx = tc.index ?? 0
          const cur = byIndex.get(idx) ?? { arguments: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments
          byIndex.set(idx, cur)
        }
      }
    } catch {
      // incomplete or non-JSON data line — skip
    }
  }

  /** Feed a raw decoded chunk; returns nothing (call finalize() at end). */
  function ingest(chunk: string): void {
    textBuffer += chunk
    // SSE events are separated by blank lines (\n\n)
    const parts = textBuffer.split('\n\n')
    textBuffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) processEventData(line.slice(6).trim())
      }
    }
  }

  /** Flush remaining buffer and return all assembled tool calls. */
  function finalize(): ToolCall[] {
    // Flush any trailing content that didn't end with \n\n
    for (const line of textBuffer.split('\n')) {
      if (line.startsWith('data: ')) processEventData(line.slice(6).trim())
    }
    textBuffer = ''
    const result: ToolCall[] = []
    for (const tc of byIndex.values()) {
      if (tc.id && tc.name) result.push({ id: tc.id, name: tc.name, arguments: tc.arguments })
    }
    return result
  }

  return { ingest, finalize }
}

// ── Non-streaming tool call extraction ───────────────────────────────────────

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
  } catch { /* ignore */ }
  return out
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerProxyRoutes(app: FastifyInstance): void {
  // Supabase is optional — proxy forwarding works without it; tool call logging is skipped.
  const cfg = getSupabaseAuthConfig()

  /** Resolve the public-facing API base URL for proxy URL display. */
  function apiBaseUrl(): string {
    return (
      process.env.API_URL ??
      process.env.SANCTUM_PUBLIC_API_URL ??
      process.env.SANCTUM_API_URL ??
      ''
    ).replace(/\/$/, '')
  }

  // GET /v1/proxy/platforms — list supported platforms (public, no auth required)
  app.get('/v1/proxy/platforms', async (_req, reply) => {
    const base = apiBaseUrl()
    return reply.send({
      platforms: Object.entries(PROXY_PLATFORMS).map(([id]) => ({
        id,
        proxyUrl: base ? `${base}/v1/proxy/${id}` : `/v1/proxy/${id}`,
      })),
    })
  })

  // All HTTP methods for /v1/proxy/:platform/<upstream-path>
  // Note: Fastify auto-registers HEAD for every GET, so 'head' is not listed explicitly.
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    app[method]<{ Params: { platform: string; '*': string } }>(
      '/v1/proxy/:platform/*',
      async (req: FastifyRequest<{ Params: { platform: string; '*': string } }>, reply) => {
        const { platform } = req.params
        const subpath = req.params['*'] ?? ''

        // ── Agent token auth ─────────────────────────────────────────────────
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
          return reply.code(401).send({
            error: 'Invalid or tampered agent token',
            hint: 'Rotate your agent token from the Sanctum console → Agents page',
          })
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

        // Platform API key forwarded as-is, never stored
        const platformAuth = req.headers['authorization'] as string | undefined
        if (!platformAuth) {
          return reply.code(400).send({
            error: 'Authorization header required',
            hint: `Set Authorization: Bearer <your-${platform}-api-key>`,
          })
        }

        // ── Build upstream request ───────────────────────────────────────────
        const qs = new URLSearchParams(req.query as Record<string, string>).toString()
        const upstreamUrl = subpath
          ? `${baseUrl}/${subpath}${qs ? `?${qs}` : ''}`
          : `${baseUrl}${qs ? `?${qs}` : ''}`

        const forwardHeaders: Record<string, string> = {
          'content-type': (req.headers['content-type'] as string | undefined) ?? 'application/json',
          authorization: platformAuth,
          'user-agent': 'sanctum-proxy/1.0',
        }

        // Abort upstream fetch if it exceeds the timeout (leaves 5s buffer before Fastify kills the request)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

        let upstream: Response
        try {
          upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers: forwardHeaders,
            signal: controller.signal,
            body: req.method !== 'GET' && req.method !== 'HEAD'
              ? JSON.stringify(req.body)
              : undefined,
          })
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError'
          log.error({ err, platform, orgId, upstreamUrl, isTimeout }, 'upstream request failed')
          return reply.code(isTimeout ? 504 : 502).send({
            error: isTimeout ? 'Upstream platform timed out' : 'Upstream platform unreachable',
            platform,
          })
        } finally {
          clearTimeout(timeoutId)
        }

        // Log non-2xx upstream responses for observability (don't block the response)
        if (!upstream.ok && upstream.status !== 401 && upstream.status !== 403) {
          log.warn({ platform, orgId, status: upstream.status, upstreamUrl }, 'upstream error response')
        }

        // ── Mirror response headers ──────────────────────────────────────────
        const replyHeaders: Record<string, string> = {}
        for (const [k, v] of upstream.headers.entries()) {
          if (!SKIP_HEADERS.has(k.toLowerCase())) replyHeaders[k] = v
        }

        // ── Tool call logger (fire-and-forget, skipped if no Supabase) ───────
        function logToolCalls(calls: ToolCall[]): void {
          if (!cfg || calls.length === 0) return
          const admin = createSupabaseAdmin(cfg)
          for (const tc of calls) {
            void admin
              .from('audit_events')
              .insert({
                org_id: orgId,
                action: tc.name,
                actor: agentId,
                decision: 'APPROVED',
                context: {
                  proxy: true,
                  platform,
                  tool_call_id: tc.id,
                  request_id: req.id,
                  arguments: parseArgs(tc.arguments),
                },
              })
              .then(({ error }) => {
                if (error) log.warn({ err: error.message, orgId, tool: tc.name }, 'proxy tool call log failed')
              })
          }
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
          const acc = createSseAccumulator()
          let clientClosed = false

          // Detect client disconnect so we can abort upstream reads
          reply.raw.on('close', () => { clientClosed = true })
          reply.raw.on('error', () => { clientClosed = true })

          try {
            while (!clientClosed) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = dec.decode(value, { stream: true })

              // Respect backpressure — pause upstream reads if client buffer is full.
              // Guard with a 10s timeout so a closed socket never leaves us waiting forever.
              const canContinue = reply.raw.write(chunk)
              if (!canContinue) {
                await new Promise<void>((resolve) => {
                  const t = setTimeout(resolve, 10_000)
                  reply.raw.once('drain', () => { clearTimeout(t); resolve() })
                })
              }

              acc.ingest(chunk)
            }
          } catch (err) {
            if (!clientClosed) log.warn({ err, orgId, platform }, 'proxy stream interrupted')
          } finally {
            reader.cancel().catch(() => {})
            reply.raw.end()
          }

          // Log all fully-assembled tool calls now that we have complete arguments
          logToolCalls(acc.finalize())
          return reply
        }

        // ── Non-streaming response ───────────────────────────────────────────
        const body = await upstream.json().catch(() => null)
        logToolCalls(toolsFromBody(body))

        void reply.code(upstream.status)
        for (const [k, v] of Object.entries(replyHeaders)) void reply.header(k, v)
        return reply.send(body)
      },
    )
  }
}
