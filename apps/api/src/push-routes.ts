import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  // POST /v1/orgs/:orgId/push-subscriptions — register an FCM token
  app.post('/v1/orgs/:orgId/push-subscriptions', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const { orgId } = req.params as { orgId: string }

    // Verify user belongs to org
    const cp = new ControlPlaneStore(cfg)
    const orgIds = await cp.getUserOrgIds(user.id)
    if (!orgIds.includes(orgId)) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }

    const body = z.object({
      token: z.string().min(10).max(512),
      deviceName: z.string().max(100).optional(),
    }).parse(req.body)

    const db = createSupabaseAdmin(cfg)
    const { error } = await db
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          org_id: orgId,
          fcm_token: body.token,
          device_name: body.deviceName ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,fcm_token' },
      )

    if (error) {
      console.warn('[push-routes] upsert error:', error.message)
      return reply.status(500).send({ error: 'subscription_failed' })
    }
    return reply.status(201).send({ ok: true })
  })

  // DELETE /v1/orgs/:orgId/push-subscriptions — unregister a token
  app.delete('/v1/orgs/:orgId/push-subscriptions', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const { orgId } = req.params as { orgId: string }
    const body = z.object({ token: z.string().min(10).max(512) }).parse(req.body)

    const db = createSupabaseAdmin(cfg)
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('fcm_token', body.token)

    if (error) {
      console.warn('[push-routes] delete error:', error.message)
      return reply.status(500).send({ error: 'unsubscribe_failed' })
    }
    return { ok: true }
  })
}
