/**
 * Public marketing-site support agent — no login, no API key.
 * Anonymous visitors get a session id; rate limits apply per IP.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { SupabaseAuthConfig } from './auth.js'
import { SupportAgentStore } from './support-agent-store.js'
import { SupportAgentService } from './support-agent-service.js'

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
      return {
        session_id: session.public_id,
        created_at: session.created_at,
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
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citation_sources ?? [],
        handoff: (m.metadata as { handoff?: unknown } | null)?.handoff ?? null,
        created_at: m.created_at,
      })),
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
        message: result.reply,
        citations: result.citations,
        handoff: result.handoff,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'session_not_found') return reply.status(404).send({ error: msg })
      if (msg === 'invalid_message') return reply.status(400).send({ error: msg })
      req.log.error({ err }, 'support chat failed')
      return reply.status(500).send({ error: 'chat_failed' })
    }
  })
}
