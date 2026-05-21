import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

const subscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z
      .object({
        p256dh: z.string(),
        auth: z.string(),
      })
      .optional(),
    expirationTime: z.number().nullable().optional(),
  }),
  userAgent: z.string().max(512).optional(),
})

const unsubscribeBody = z.object({
  endpoint: z.string().url(),
})

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const admin = createSupabaseAdmin(cfg)
  const vapidPublic = process.env.VITE_VAPID_PUBLIC_KEY?.trim() || process.env.VAPID_PUBLIC_KEY?.trim()
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim()

  app.get('/v1/push/status', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const { count, error } = await admin
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (error) return reply.status(500).send({ error: 'push_status_failed', detail: error.message })

    return {
      deviceCount: count ?? 0,
      vapidConfigured: Boolean(vapidPublic && vapidPrivate),
      pushEnabled: Boolean(vapidPublic),
    }
  })

  app.post('/v1/push/subscribe', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const parsed = subscribeBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.flatten() })
    }

    const { subscription, userAgent } = parsed.data
    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription,
        user_agent: userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )

    if (error) return reply.status(500).send({ error: 'subscribe_failed', detail: error.message })
    return { ok: true }
  })

  app.delete('/v1/push/unsubscribe', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const parsed = unsubscribeBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.flatten() })
    }

    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', parsed.data.endpoint)

    if (error) return reply.status(500).send({ error: 'unsubscribe_failed', detail: error.message })
    return { ok: true }
  })
}

const DEFAULT_PUSH_ICON =
  process.env.SANCTUM_PUSH_ICON_URL?.trim() ||
  'https://console.sanctumruntime.com/favicon-512.png'

/** Send web push to all devices for a user (no-op if VAPID not configured). */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string
    body: string
    url?: string
    tag?: string
    requireInteraction?: boolean
    icon?: string
  },
): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:ops@sanctumruntime.com'
  if (!cfg || !publicKey || !privateKey) return

  const admin = createSupabaseAdmin(cfg)
  const { data: rows, error } = await admin
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', userId)

  if (error || !rows?.length) return

  try {
    const webpush = await import('web-push')
    webpush.setVapidDetails(subject, publicKey, privateKey)
    const body = JSON.stringify({
      icon: DEFAULT_PUSH_ICON,
      ...payload,
    })
    await Promise.allSettled(
      rows.map((row) => {
        const sub = row.subscription as webpush.PushSubscription
        return webpush.sendNotification(sub, body)
      }),
    )
  } catch (e) {
    console.warn('[push] send failed', e)
  }
}
