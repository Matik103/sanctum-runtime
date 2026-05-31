import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PushSubscription } from 'web-push'
import { z } from 'zod'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { logger as rootLogger } from './logger.js'

const log = rootLogger.child({ module: 'push-routes' })

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
  const vapidPublic = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim()
  const firebaseConfigured = Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_CLIENT_EMAIL?.trim() ||
    process.env.FIREBASE_PRIVATE_KEY?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim(),
  )
  const vapidConfigured = Boolean(vapidPublic && vapidPrivate)

  app.get('/v1/push/vapid-key', async (_req, reply) => {
    return reply.send({
      provider: 'web-push-vapid',
      publicKey: vapidConfigured ? vapidPublic : null,
      vapidConfigured,
      firebaseConfigured,
    })
  })

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
      provider: 'web-push-vapid',
      vapidConfigured,
      firebaseConfigured,
      pushEnabled: vapidConfigured,
    }
  })

  app.post('/v1/push/test', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })
    if (!vapidConfigured) return reply.status(503).send({ error: 'push_not_configured' })

    const { count, error } = await admin
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (error) return reply.status(500).send({ error: 'push_status_failed', detail: error.message })
    if (!count) return reply.status(409).send({ error: 'no_push_subscription' })

    const delivery = await sendPushToUser(user.id, {
      title: 'Sanctum notifications are ready',
      body: 'This device will receive approval and incident alerts.',
      tag: `push-test:${user.id}`,
      url: '/?page=settings',
      data: { type: 'push.test' },
    })

    if (!delivery.delivered) {
      if (delivery.expired === delivery.subscriptions) {
        return reply.status(409).send({ error: 'stale_push_subscription' })
      }
      return reply.status(502).send({ error: 'push_delivery_failed' })
    }

    return { ok: true, deviceCount: count, delivered: delivery.delivered }
  })

  app.post('/v1/push/subscribe', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })
    if (!vapidConfigured) return reply.status(503).send({ error: 'push_not_configured' })

    const parsed = subscribeBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: z.flattenError(parsed.error) })
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
      return reply.status(400).send({ error: 'invalid_body', detail: z.flattenError(parsed.error) })
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

type PushDeliveryResult = {
  subscriptions: number
  delivered: number
  expired: number
  failed: number
}

/** Send web push to all devices for a user (no-op if VAPID is not configured). */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string
    body: string
    url?: string
    tag?: string
    requireInteraction?: boolean
    icon?: string
    data?: Record<string, unknown>
  },
): Promise<PushDeliveryResult> {
  const emptyResult = { subscriptions: 0, delivered: 0, expired: 0, failed: 0 }
  const cfg = getSupabaseAuthConfig()
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.VITE_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:ops@sanctumruntime.com'
  if (!cfg || !publicKey || !privateKey) return emptyResult

  const admin = createSupabaseAdmin(cfg)
  const { data: rows, error } = await admin
    .from('push_subscriptions')
    .select('endpoint,subscription')
    .eq('user_id', userId)

  if (error || !rows?.length) return emptyResult

  try {
    const webpush = await import('web-push')
    webpush.setVapidDetails(subject, publicKey, privateKey)
    const body = JSON.stringify({
      icon: DEFAULT_PUSH_ICON,
      ...payload,
    })
    const results = await Promise.allSettled(
      rows.map((row) => {
        const sub = row.subscription as PushSubscription
        return webpush.sendNotification(sub, body)
      }),
    )
    const expiredEndpoints = results.flatMap((result, index) => {
      if (result.status !== 'rejected') return []
      const statusCode =
        typeof result.reason === 'object' && result.reason !== null && 'statusCode' in result.reason
          ? Number((result.reason as { statusCode?: unknown }).statusCode)
          : null
      return statusCode === 404 || statusCode === 410 ? [rows[index].endpoint as string] : []
    })
    if (expiredEndpoints.length > 0) {
      await admin
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .in('endpoint', expiredEndpoints)
    }
    const delivered = results.filter((result) => result.status === 'fulfilled').length
    return {
      subscriptions: rows.length,
      delivered,
      expired: expiredEndpoints.length,
      failed: rows.length - delivered - expiredEndpoints.length,
    }
  } catch (e) {
    log.warn({ err: e instanceof Error ? e : new Error(String(e)) }, 'push send failed')
    return { subscriptions: rows.length, delivered: 0, expired: 0, failed: rows.length }
  }
}

/** Send a PWA web-push notification to every subscribed member of an organization. */
export async function sendWebPushToOrg(
  orgId: string,
  payload: Parameters<typeof sendPushToUser>[1],
): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const admin = createSupabaseAdmin(cfg)
  const { data: members, error } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)

  if (error || !members?.length) return

  await Promise.allSettled(
    members.map((member) => sendPushToUser(member.user_id as string, payload)),
  )
}
