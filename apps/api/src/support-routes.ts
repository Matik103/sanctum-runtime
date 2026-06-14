/**
 * Public marketing-site support agent — no login, no API key.
 * Anonymous visitors get a session id; rate limits apply per IP.
 * Operator inbox routes require dashboard JWT + allowlisted email.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { SupabaseAuthConfig } from './auth.js'
import { SupportAgentStore } from './support-agent-store.js'
import { SupportAgentService } from './support-agent-service.js'
import { assertSupportInboxOperator } from './support-inbox-auth.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

const CreateSessionSchema = z.object({
  referrer: z.string().max(500).optional(),
  landing_path: z.string().max(300).optional(),
  locale: z.string().max(12).optional(),
  visitor_fingerprint: z.string().max(64).optional(),
})

const ChatSchema = z.object({
  session_id: z.string().min(8).max(64),
  message: z.string().min(1).max(4000),
})

const FeedbackSchema = z.object({
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().max(500).optional(),
})

const OperatorReplySchema = z.object({
  content: z.string().min(1).max(4000),
})

function mapMessage(m: {
  id: unknown
  role: unknown
  content: unknown
  citation_sources: unknown
  metadata: unknown
  created_at: unknown
}) {
  const meta = (m.metadata ?? {}) as {
    handoff?: unknown
    follow_ups?: string[]
    sender?: string
    operator_email?: string
  }
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citation_sources ?? [],
    handoff: meta.handoff ?? null,
    follow_ups: meta.follow_ups ?? [],
    sender: meta.sender ?? (meta.operator_email ? 'operator' : 'bot'),
    created_at: m.created_at,
  }
}

export async function registerSupportRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const store = new SupportAgentStore(cfg)
  const service = new SupportAgentService(cfg)

  app.post('/v1/support/sessions', {
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = CreateSessionSchema.safeParse(req.body ?? {})
    if (!body.success) return reply.status(400).send({ error: 'invalid_payload' })

    try {
      const session = await store.createSession({
        referrer: body.data.referrer,
        landing_path: body.data.landing_path,
        locale: body.data.locale,
        visitor_fingerprint: body.data.visitor_fingerprint,
      })
      await store.recordEvent({
        session_id: session.id,
        event_type: 'session_started',
        payload: { landing_path: body.data.landing_path ?? null },
      })
      return {
        session_id: session.public_id,
        created_at: session.created_at,
        status: 'bot',
      }
    } catch (err) {
      req.log.error({ err }, 'support session create failed')
      return reply.status(500).send({ error: 'session_create_failed' })
    }
  })

  app.get('/v1/support/sessions/:sessionId/messages', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    if (!sessionId || sessionId.length > 64) {
      return reply.status(400).send({ error: 'invalid_session_id' })
    }

    const session = await store.getSessionByPublicId(sessionId)
    if (!session) return reply.status(404).send({ error: 'session_not_found' })

    const messages = await store.listMessages(session.id, 50)
    return {
      session_id: session.public_id,
      status: (session as { status?: string }).status ?? 'bot',
      messages: messages.map(mapMessage),
    }
  })

  app.post('/v1/support/chat', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = ChatSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'invalid_payload' })

    try {
      const result = await service.handleChat({
        sessionPublicId: body.data.session_id,
        message: body.data.message,
      })
      return {
        session_id: body.data.session_id,
        session_status: result.session_status,
        message: result.reply,
        citations: result.citations,
        handoff: result.handoff,
        follow_ups: result.follow_ups,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'session_not_found') return reply.status(404).send({ error: msg })
      if (msg === 'invalid_message') return reply.status(400).send({ error: msg })
      req.log.error({ err }, 'support chat failed')
      return reply.status(500).send({ error: 'chat_failed' })
    }
  })

  app.post('/v1/support/chat/stream', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = ChatSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'invalid_payload' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    const send = (event: string, data: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      await service.handleChatStream(
        { sessionPublicId: body.data.session_id, message: body.data.message },
        send,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'session_not_found' || msg === 'invalid_message') {
        send('error', { error: msg })
      } else {
        req.log.error({ err }, 'support chat stream failed')
        send('error', { error: 'chat_failed' })
      }
    }
    reply.raw.end()
  })

  app.post('/v1/support/sessions/:sessionId/escalate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }
    const body = z.object({ message: z.string().max(4000).optional() }).safeParse(req.body ?? {})
    if (!sessionId || sessionId.length > 64) {
      return reply.status(400).send({ error: 'invalid_session_id' })
    }

    try {
      const result = await service.escalateWithNotify({
        sessionPublicId: sessionId,
        reason: 'requested',
        visitorMessage: body.success ? (body.data.message ?? 'Visitor requested human help') : 'Visitor requested human help',
      })
      return {
        session_id: sessionId,
        status: result.status,
        already_queued: result.alreadyQueued,
        confirmation: result.confirmation,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'session_not_found') return reply.status(404).send({ error: msg })
      req.log.error({ err }, 'support escalate failed')
      return reply.status(500).send({ error: 'escalate_failed' })
    }
  })

  app.post('/v1/support/messages/:messageId/feedback', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string }
    const body = FeedbackSchema.safeParse(req.body ?? {})
    if (!body.success) return reply.status(400).send({ error: 'invalid_payload' })

    const msgRow = await store.getMessageById(messageId)
    if (!msgRow) return reply.status(404).send({ error: 'message_not_found' })
    if (msgRow.role !== 'assistant') return reply.status(400).send({ error: 'feedback_assistant_only' })

    try {
      const feedback = await store.recordFeedback({
        message_id: messageId,
        session_id: msgRow.session_id,
        rating: body.data.rating,
        comment: body.data.comment,
      })
      await store.recordEvent({
        session_id: msgRow.session_id,
        message_id: messageId,
        event_type: 'feedback_submitted',
        payload: { rating: body.data.rating },
      })
      return { ok: true, feedback }
    } catch (err) {
      req.log.error({ err }, 'support feedback failed')
      return reply.status(500).send({ error: 'feedback_failed' })
    }
  })

  // ── Operator inbox (authenticated) ─────────────────────────────────────────

  async function requireInboxOperator(req: SanctumReq, reply: FastifyReply) {
    const user = req.sanctumUser
    if (!user) {
      reply.status(403).send({ error: 'dashboard_auth_required' })
      return null
    }
    if (!(await assertSupportInboxOperator(store, user, reply))) return null
    return user
  }

  app.get('/v1/support/inbox/sessions', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const query = z
      .object({ status: z.string().optional() })
      .parse(req.query ?? {})
    const statuses = query.status
      ? (query.status.split(',') as ('queued' | 'human_active' | 'resolved' | 'bot')[])
      : (['queued', 'human_active'] as const)

    const sessions = await store.listInboxSessions({ status: [...statuses], limit: 80 })
    const withPreview = await Promise.all(
      sessions.map(async (s) => ({
        ...s,
        preview: await store.getSessionPreview(s.id),
      })),
    )
    return { sessions: withPreview, operator: user.email }
  })

  app.get('/v1/support/inbox/sessions/:sessionId', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const { sessionId } = req.params as { sessionId: string }
    const session = await store.getSessionByPublicId(sessionId)
    if (!session) return reply.status(404).send({ error: 'session_not_found' })

    const messages = await store.listMessages(session.id, 100)
    return {
      session: {
        session_id: session.public_id,
        status: (session as { status?: string }).status ?? 'bot',
        handoff_reason: (session as { handoff_reason?: string | null }).handoff_reason ?? null,
        assigned_operator_email:
          (session as { assigned_operator_email?: string | null }).assigned_operator_email ?? null,
        landing_path: (session as { landing_path?: string | null }).landing_path ?? null,
        escalated_at: (session as { escalated_at?: string | null }).escalated_at ?? null,
        created_at: session.created_at,
        last_message_at: session.last_message_at,
      },
      messages: messages.map(mapMessage),
    }
  })

  app.post('/v1/support/inbox/sessions/:sessionId/claim', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const { sessionId } = req.params as { sessionId: string }
    const session = await store.getSessionByPublicId(sessionId)
    if (!session) return reply.status(404).send({ error: 'session_not_found' })

    const claimed = await store.claimSession({
      session_id: session.id,
      operator_id: user.id,
      operator_email: user.email ?? 'operator',
    })
    if (!claimed) return reply.status(409).send({ error: 'claim_failed' })
    return { ok: true, status: claimed.status }
  })

  app.post('/v1/support/inbox/sessions/:sessionId/reply', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const { sessionId } = req.params as { sessionId: string }
    const body = OperatorReplySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'invalid_payload' })

    const session = await store.getSessionByPublicId(sessionId)
    if (!session) return reply.status(404).send({ error: 'session_not_found' })

    await store.claimSession({
      session_id: session.id,
      operator_id: user.id,
      operator_email: user.email ?? 'operator',
    })

    const replyMsg = await store.addOperatorMessage({
      session_id: session.id,
      content: body.data.content.trim(),
      operator_id: user.id,
      operator_email: user.email ?? 'operator',
    })

    await store.recordEvent({
      session_id: session.id,
      message_id: replyMsg.id as string,
      event_type: 'operator_replied',
      payload: { operator_email: user.email },
    })

    return { ok: true, message: mapMessage(replyMsg) }
  })

  app.post('/v1/support/inbox/sessions/:sessionId/resolve', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const { sessionId } = req.params as { sessionId: string }
    const session = await store.getSessionByPublicId(sessionId)
    if (!session) return reply.status(404).send({ error: 'session_not_found' })

    const resolved = await store.resolveSession(session.id, user.email)
    return { ok: true, status: resolved?.status ?? 'resolved' }
  })

  app.get('/v1/support/inbox/analytics', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    const { days } = z.object({ days: z.coerce.number().min(1).max(90).optional() }).parse(req.query ?? {})
    const analytics = await store.getInboxAnalytics(days ?? 7)
    return { analytics }
  })

  app.get('/v1/support/inbox/stream', async (req, reply) => {
    const user = await requireInboxOperator(req as SanctumReq, reply)
    if (!user) return

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    let lastPayload = ''
    const tick = async () => {
      try {
        const sessions = await store.listInboxSessions({ status: ['queued', 'human_active'], limit: 50 })
        const withPreview = await Promise.all(
          sessions.map(async (s) => ({
            ...s,
            preview: await store.getSessionPreview(s.id),
          })),
        )
        const payload = JSON.stringify({ sessions: withPreview, at: new Date().toISOString() })
        if (payload !== lastPayload) {
          lastPayload = payload
          reply.raw.write(`data: ${payload}\n\n`)
        } else {
          reply.raw.write(`: ping ${Date.now()}\n\n`)
        }
      } catch {
        reply.raw.write(`event: error\ndata: {"message":"tick_failed"}\n\n`)
      }
    }

    await tick()
    const interval = setInterval(tick, 2500)
    req.raw.on('close', () => clearInterval(interval))
  })
}
