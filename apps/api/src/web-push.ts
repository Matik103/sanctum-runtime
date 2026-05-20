import webpush from 'web-push'
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? ''
const VAPID_EMAIL = process.env.VAPID_EMAIL?.trim() || 'mailto:support@sanctumruntime.com'

let vapidConfigured = false

export function initVapid() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  vapidConfigured = true
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY
}

export type PushPayload = {
  title: string
  body: string
  tag?: string
  url?: string
  icon?: string
  badge?: string
  data?: Record<string, unknown>
}

/** Send a push notification to all subscriptions for an org. */
export async function sendPushToOrg(
  cfg: SupabaseAuthConfig,
  orgId: string,
  payload: PushPayload,
): Promise<void> {
  if (!vapidConfigured) return

  const admin = createSupabaseAdmin(cfg)
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth_key')
    .eq('org_id', orgId)

  if (!subs?.length) return

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? 'sanctum-notification',
    icon: payload.icon ?? '/favicon-512.png',
    badge: payload.badge ?? '/favicon.png',
    url: payload.url ?? '/',
    data: payload.data ?? {},
  })

  const stale: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          message,
          { TTL: 60 * 60 * 24 }, // 24h TTL
        )
        // Update last_used_at best-effort
        void admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        // 404/410 = subscription expired/unsubscribed — clean up
        if (status === 404 || status === 410) stale.push(sub.id as string)
      }
    }),
  )

  if (stale.length > 0) {
    void admin.from('push_subscriptions').delete().in('id', stale)
  }
}

/** Register push subscription routes on the Fastify app. */
export function registerPushRoutes(
  app: import('fastify').FastifyInstance,
  cfg: SupabaseAuthConfig,
  resolveOrgId: (req: import('fastify').FastifyRequest) => Promise<string | null>,
) {
  const admin = createSupabaseAdmin(cfg)

  // GET /v1/push/vapid-key — public key for the browser to use
  app.get('/v1/push/vapid-key', async () => {
    return { publicKey: getVapidPublicKey() }
  })

  // POST /v1/push/subscribe — register a push subscription
  app.post('/v1/push/subscribe', async (req, reply) => {
    const orgId = await resolveOrgId(req)
    if (!orgId) return reply.status(403).send({ error: 'org_forbidden' })

    const body = req.body as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      userAgent?: string
    }
    const sub = body?.subscription
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return reply.status(400).send({ error: 'invalid_subscription' })
    }

    const user = (req as { sanctumUser?: { id: string } }).sanctumUser

    await admin.from('push_subscriptions').upsert(
      {
        org_id: orgId,
        user_id: user?.id ?? null,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth_key: sub.keys.auth,
        user_agent: body.userAgent?.slice(0, 512) ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    return { ok: true }
  })

  // DELETE /v1/push/subscribe — unsubscribe
  app.delete('/v1/push/subscribe', async (req, reply) => {
    const orgId = await resolveOrgId(req)
    if (!orgId) return reply.status(403).send({ error: 'org_forbidden' })

    const body = req.body as { endpoint?: string }
    if (!body?.endpoint) return reply.status(400).send({ error: 'missing_endpoint' })

    await admin.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('org_id', orgId)
    return { ok: true }
  })
}
