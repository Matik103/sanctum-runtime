import { createHmac } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine } from './entitlements.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

// In-memory rate limit: one export per org per hour
const exportCooldowns = new Map<string, number>()

function encryptSecret(plaintext: string): string {
  const key = process.env.SSO_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-key-change-in-production'
  const hmac = createHmac('sha256', key).update(plaintext).digest('hex')
  // In production: use AES-256-GCM. This is a placeholder marker.
  return `enc:v1:${Buffer.from(plaintext).toString('base64')}:${hmac.slice(0, 16)}`
}

export async function registerExportRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  async function resolveOrgId(req: SanctumReq, orgIdParam?: string): Promise<string | null> {
    if (req.sanctumUser) {
      const orgs = await store.getUserOrgIds(req.sanctumUser.id)
      if (orgIdParam) return orgs?.includes(orgIdParam) ? orgIdParam : null
      return orgs?.[0] ?? null
    }
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (orgIdParam && keyOrg !== orgIdParam) return null
      return keyOrg
    }
    return null
  }

  // ── GDPR Data Export ────────────────────────────────────────────────────────

  // GET /v1/orgs/:orgId/export.json
  app.get('/v1/orgs/:orgId/export.json', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    // Rate limit: one export per hour per org
    const last = exportCooldowns.get(orgId) ?? 0
    if (Date.now() - last < 3_600_000) {
      const nextMs = 3_600_000 - (Date.now() - last)
      return reply.status(429).send({
        error: 'export_rate_limited',
        retryAfterMs: nextMs,
        retryAfterMinutes: Math.ceil(nextMs / 60_000),
      })
    }
    exportCooldowns.set(orgId, Date.now())

    const admin = createSupabaseAdmin(cfg)
    const exportedAt = new Date().toISOString()

    // Fetch all org data in parallel
    const [auditRes, runtimesRes, apiKeysRes, usageRes] = await Promise.allSettled([
      admin.from('audit_events').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(10000),
      admin.from('registered_runtimes').select('id,name,status,mode,region,connected_at,last_seen_at,attestation_report,trust_score').eq('org_id', orgId),
      admin.from('api_keys').select('id,name,key_prefix,org_id,created_at,last_used_at,revoked_at').eq('org_id', orgId),
      admin.from('usage_events').select('metric,quantity,metadata,recorded_at').eq('org_id', orgId).order('recorded_at', { ascending: false }).limit(50000),
    ])

    const auditEvents = auditRes.status === 'fulfilled' ? (auditRes.value.data ?? []) : []
    const runtimes = runtimesRes.status === 'fulfilled' ? (runtimesRes.value.data ?? []) : []
    const apiKeys = apiKeysRes.status === 'fulfilled' ? (apiKeysRes.value.data ?? []) : []
    const usageEvents = usageRes.status === 'fulfilled' ? (usageRes.value.data ?? []) : []

    const totalRecords = auditEvents.length + runtimes.length + apiKeys.length + usageEvents.length

    // Log export in audit table
    await admin.from('export_audit').insert({
      org_id: orgId,
      requested_by: (req as SanctumReq).sanctumUser?.email ?? 'api_key',
      export_type: 'full',
      record_count: totalRecords,
    }).catch(() => { /* best-effort */ })

    const payload = {
      export_version: '1.0',
      exported_at: exportedAt,
      org_id: orgId,
      record_counts: {
        audit_events: auditEvents.length,
        runtimes: runtimes.length,
        api_keys: apiKeys.length,
        usage_events: usageEvents.length,
      },
      data: {
        audit_events: auditEvents,
        runtimes,
        api_keys: apiKeys, // no key_hash included
        usage_events: usageEvents,
      },
    }

    return reply
      .header('Content-Disposition', `attachment; filename="sanctum-export-${orgId}-${exportedAt.slice(0, 10)}.json"`)
      .type('application/json')
      .send(JSON.stringify(payload, null, 2))
  })

  // GET /v1/orgs/:orgId/export/history
  app.get('/v1/orgs/:orgId/export/history', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const admin = createSupabaseAdmin(cfg)
    const { data } = await admin
      .from('export_audit')
      .select('id,requested_by,export_type,record_count,created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    return data ?? []
  })

  // ── SSO / OIDC Configuration (Enterprise feature) ──────────────────────────

  // GET /v1/orgs/:orgId/sso
  app.get('/v1/orgs/:orgId/sso', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const limits = await entitlements.getLimits(orgId)
    if (!entitlements.hasFeature(limits, 'sso')) {
      return reply.status(402).send({
        error: 'enterprise_feature',
        feature: 'sso',
        message: 'SSO/OIDC is available on the Enterprise plan. Contact billing@sanctum.run to upgrade.',
        currentPlan: limits.planId,
      })
    }

    const admin = createSupabaseAdmin(cfg)
    const { data } = await admin
      .from('sso_configs')
      .select('oidc_issuer,oidc_client_id,oidc_scopes,attribute_map,enabled,created_at,updated_at')
      .eq('org_id', orgId)
      .maybeSingle()

    return data ?? { configured: false }
  })

  // PUT /v1/orgs/:orgId/sso
  app.put('/v1/orgs/:orgId/sso', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const limits = await entitlements.getLimits(orgId)
    if (!entitlements.hasFeature(limits, 'sso')) {
      return reply.status(402).send({
        error: 'enterprise_feature',
        feature: 'sso',
        message: 'SSO/OIDC requires the Enterprise plan.',
        currentPlan: limits.planId,
      })
    }

    const body = z.object({
      oidc_issuer: z.string().url(),
      oidc_client_id: z.string().min(1).max(256),
      oidc_client_secret: z.string().min(1).max(512),
      oidc_scopes: z.array(z.string()).optional().default(['openid', 'email', 'profile']),
      attribute_map: z.record(z.string()).optional().default({}),
      enabled: z.boolean().optional().default(false),
    }).parse(req.body)

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('sso_configs')
      .upsert({
        org_id: orgId,
        oidc_issuer: body.oidc_issuer,
        oidc_client_id: body.oidc_client_id,
        oidc_client_secret_enc: encryptSecret(body.oidc_client_secret),
        oidc_scopes: body.oidc_scopes,
        attribute_map: body.attribute_map,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' })
      .select('org_id,oidc_issuer,oidc_client_id,oidc_scopes,enabled,updated_at')
      .single()

    if (error) return reply.status(500).send({ error: 'sso_config_failed', detail: error.message })
    return data
  })

  // GET /v1/sso/:orgId/login — initiates OIDC flow
  app.get('/v1/sso/:orgId/login', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const admin = createSupabaseAdmin(cfg)

    const { data: ssoConfig } = await admin
      .from('sso_configs')
      .select('oidc_issuer,oidc_client_id,oidc_scopes,enabled')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!ssoConfig?.enabled) {
      return reply.status(404).send({ error: 'sso_not_configured', orgId })
    }

    // Fetch OIDC discovery document
    const disco = await fetch(`${ssoConfig.oidc_issuer}/.well-known/openid-configuration`)
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .catch(() => null)

    if (!disco?.authorization_endpoint) {
      return reply.status(502).send({ error: 'oidc_discovery_failed' })
    }

    const state = crypto.randomUUID()
    const redirectUri = `${process.env.SANCTUM_API_URL ?? ''}/v1/sso/callback`
    const scopes = (ssoConfig.oidc_scopes as string[]).join(' ')

    const authUrl = new URL(disco.authorization_endpoint as string)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', ssoConfig.oidc_client_id)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', state)

    return reply.redirect(authUrl.toString())
  })

  // ── Notification Preferences ────────────────────────────────────────────────

  // GET /v1/orgs/:orgId/notifications
  app.get('/v1/orgs/:orgId/notifications', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const admin = createSupabaseAdmin(cfg)
    const { data } = await admin
      .from('org_plans')
      .select('notification_email,slack_webhook_url,notification_webhook_url,quota_warning_pct')
      .eq('org_id', orgId)
      .maybeSingle()

    return data ?? {}
  })

  // PATCH /v1/orgs/:orgId/notifications
  app.patch('/v1/orgs/:orgId/notifications', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const body = z.object({
      notification_email: z.string().email().nullable().optional(),
      slack_webhook_url: z.string().url().nullable().optional(),
      notification_webhook_url: z.string().url().nullable().optional(),
      quota_warning_pct: z.number().int().min(50).max(100).optional(),
    }).parse(req.body)

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('org_plans')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .select('notification_email,slack_webhook_url,notification_webhook_url,quota_warning_pct')
      .single()

    if (error) return reply.status(500).send({ error: 'notification_prefs_failed', detail: error.message })
    return data
  })
}
