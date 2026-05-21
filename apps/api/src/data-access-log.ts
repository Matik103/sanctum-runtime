import type { FastifyRequest } from 'fastify'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

function extractIp(req: FastifyRequest): string | undefined {
  const fwd = req.headers['x-forwarded-for']
  const xff = Array.isArray(fwd) ? fwd[0] : fwd
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (real) return Array.isArray(real) ? real[0] : real
  return (req.ip as string | undefined) || undefined
}

/**
 * Records a data-read event for GDPR Article 30 compliance.
 * Logs to the Fastify structured logger (flows to any log drain) and
 * persists to data_access_log in Supabase (best-effort, non-blocking).
 */
export function logDataAccess(
  cfg: SupabaseAuthConfig | null,
  req: FastifyRequest,
  opts: {
    orgId: string
    resource: string
    resourceId?: string
  },
): void {
  const user = (req as { sanctumUser?: { id: string } }).sanctumUser
  const rawKey = req.headers['x-sanctum-key']
  const keyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey
  const actorKeyPrefix = keyStr?.startsWith('sk_sanctum_') ? keyStr.slice(0, 16) : undefined
  const ip = extractIp(req)

  req.log.info({
    audit: 'data_access',
    orgId: opts.orgId,
    resource: opts.resource,
    resourceId: opts.resourceId ?? null,
    actorUserId: user?.id ?? null,
    actorKeyPrefix: actorKeyPrefix ?? null,
    actorIp: ip ?? null,
  }, '[data_access]')

  if (!cfg) return

  const admin = createSupabaseAdmin(cfg)
  void admin.from('data_access_log').insert({
    org_id: opts.orgId,
    actor_user_id: user?.id ?? null,
    actor_key_prefix: actorKeyPrefix ?? null,
    actor_ip: ip ?? null,
    resource: opts.resource,
    resource_id: opts.resourceId ?? null,
  }).then(({ error }) => {
    if (error) req.log.warn({ err: error }, '[data_access] persist failed')
  })
}
