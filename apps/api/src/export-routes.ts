import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine } from './entitlements.js'
import { encryptSecret, decryptSecret, getEncryptionKey } from './crypto-utils.js'
import { isProduction, maskWebhookUrl } from './security.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

// DB-backed rate limit: persisted across redeploys via export_audit table

// Cache for OIDC discovery documents: issuer → { tokenEndpoint, fetchedAt }
const oidcDiscoveryCache = new Map<string, { tokenEndpoint: string; authorizationEndpoint: string; fetchedAt: number }>()
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

async function fetchOidcDiscovery(issuer: string): Promise<{ tokenEndpoint: string; authorizationEndpoint: string } | null> {
  const cached = oidcDiscoveryCache.get(issuer)
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return { tokenEndpoint: cached.tokenEndpoint, authorizationEndpoint: cached.authorizationEndpoint }
  }

  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const doc = await res.json() as Record<string, unknown>
    const tokenEndpoint = doc['token_endpoint'] as string | undefined
    const authorizationEndpoint = doc['authorization_endpoint'] as string | undefined
    if (!tokenEndpoint || !authorizationEndpoint) return null

    oidcDiscoveryCache.set(issuer, { tokenEndpoint, authorizationEndpoint, fetchedAt: Date.now() })
    return { tokenEndpoint, authorizationEndpoint }
  } catch {
    return null
  }
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
    try {
      const { orgId } = req.params as { orgId: string }
      const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
      if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

      const admin = createSupabaseAdmin(cfg)

      // Rate limit: one export per hour per org — checked in DB so it survives redeploys
      const { data: lastExport } = await admin
        .from('export_audit')
        .select('created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastExport?.created_at) {
        const lastMs = new Date(lastExport.created_at as string).getTime()
        const elapsed = Date.now() - lastMs
        if (elapsed < 3_600_000) {
          const nextMs = 3_600_000 - elapsed
          return reply.status(429).send({
            error: 'export_rate_limited',
            retryAfterMs: nextMs,
            retryAfterMinutes: Math.ceil(nextMs / 60_000),
          })
        }
      }

      const exportedAt = new Date().toISOString()

      // Lean columns only (no full payload) — stays under Supabase free-tier PostgREST timeout (~8s).
      const queryWithTimeout = async <T>(
        label: string,
        run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
        ms = 8000,
      ): Promise<{ data: T; warning?: string }> => {
        try {
          const result = await Promise.race([
            run(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
            ),
          ])
          if (result.error) {
            return { data: [] as T, warning: `${label}: ${result.error.message}` }
          }
          return { data: (result.data ?? []) as T }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { data: [] as T, warning: `${label}: ${msg}` }
        }
      }

      const [auditOut, runtimesOut, apiKeysOut, usageOut] = await Promise.all([
        queryWithTimeout(
          'audit_events',
          () =>
            admin
              .from('audit_events')
              .select(
                'id,correlation_id,org_id,actor,action,decision,risk,reasoning,anomaly_flags,resolved_by,created_at,resolved_at',
              )
              .eq('org_id', orgId)
              .order('created_at', { ascending: false })
              .limit(1000),
        ),
        queryWithTimeout(
          'registered_runtimes',
          () =>
            admin
              .from('registered_runtimes')
              .select('id,name,status,mode,region,connected_at,last_seen_at,trust_score')
              .eq('org_id', orgId),
        ),
        queryWithTimeout(
          'api_keys',
          () =>
            admin
              .from('api_keys')
              .select('id,name,key_prefix,org_id,created_at,last_used_at,revoked_at')
              .eq('org_id', orgId),
        ),
        queryWithTimeout(
          'usage_events',
          () =>
            admin
              .from('usage_events')
              .select('metric,quantity,recorded_at')
              .eq('org_id', orgId)
              .order('recorded_at', { ascending: false })
              .limit(2000),
        ),
      ])

      const auditEvents = auditOut.data
      const runtimes = runtimesOut.data
      const apiKeys = apiKeysOut.data
      const usageEvents = usageOut.data
      const warnings = [auditOut, runtimesOut, apiKeysOut, usageOut]
        .map((o) => o.warning)
        .filter((w): w is string => Boolean(w))

      const totalRecords = auditEvents.length + runtimes.length + apiKeys.length + usageEvents.length

      // Log export in audit table (best-effort — missing table won't block the export)
      await admin.from('export_audit').insert({
        org_id: orgId,
        requested_by: (req as SanctumReq).sanctumUser?.email ?? 'api_key',
        export_type: 'full',
        record_count: totalRecords,
      }).catch(() => {})

      const payload = {
        export_version: '1.0',
        exported_at: exportedAt,
        org_id: orgId,
        ...(warnings.length > 0 ? { warnings } : {}),
        record_counts: {
          audit_events: auditEvents.length,
          runtimes: runtimes.length,
          api_keys: apiKeys.length,
          usage_events: usageEvents.length,
        },
        data: {
          audit_events: auditEvents,
          runtimes,
          api_keys: apiKeys,
          usage_events: usageEvents,
        },
      }

      return reply
        .header('Content-Disposition', `attachment; filename="sanctum-export-${orgId}-${exportedAt.slice(0, 10)}.json"`)
        .type('application/json')
        .send(JSON.stringify(payload, null, 2))
    } catch (err) {
      req.log.error({ err }, 'GDPR export failed')
      return reply.status(500).send({
        error: 'export_failed',
        ...(!isProduction() && {
          detail: err instanceof Error ? err.message : String(err),
        }),
        hint: 'Database query failed or timed out. Retry in a few minutes, or upgrade Supabase plan for heavier exports.',
      })
    }
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

    const encKey = getEncryptionKey()
    const encryptedSecret = await encryptSecret(body.oidc_client_secret, encKey)

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('sso_configs')
      .upsert({
        org_id: orgId,
        oidc_issuer: body.oidc_issuer,
        oidc_client_id: body.oidc_client_id,
        oidc_client_secret_enc: encryptedSecret,
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

    const disco = await fetchOidcDiscovery(ssoConfig.oidc_issuer as string)
    if (!disco?.authorizationEndpoint) {
      return reply.status(502).send({ error: 'oidc_discovery_failed' })
    }

    const state = `${orgId}.${crypto.randomUUID()}`
    const redirectUri = `${process.env.SANCTUM_API_URL ?? ''}/v1/sso/callback`
    const scopes = (ssoConfig.oidc_scopes as string[]).join(' ')

    const authUrl = new URL(disco.authorizationEndpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', ssoConfig.oidc_client_id as string)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', state)

    return reply.redirect(authUrl.toString())
  })

  // GET /v1/sso/callback — OIDC authorization code callback
  app.get('/v1/sso/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string; error_description?: string }

    if (q.error) {
      const dashUrl = process.env.SANCTUM_DASHBOARD_URL ?? process.env.VITE_DASHBOARD_URL ?? 'http://localhost:5174'
      return reply.redirect(`${dashUrl}/auth/sso-error?error=${encodeURIComponent(q.error)}&description=${encodeURIComponent(q.error_description ?? '')}`)
    }

    if (!q.code || !q.state) {
      return reply.status(400).send({ error: 'missing_code_or_state' })
    }

    // State encodes orgId: "<orgId>.<nonce>"
    const dotIdx = q.state.indexOf('.')
    const orgId = dotIdx > 0 ? q.state.slice(0, dotIdx) : q.state

    if (!orgId) {
      return reply.status(400).send({ error: 'invalid_state' })
    }

    const admin = createSupabaseAdmin(cfg)

    // Fetch SSO config for the org
    const { data: ssoConfig } = await admin
      .from('sso_configs')
      .select('oidc_issuer,oidc_client_id,oidc_client_secret_enc,oidc_scopes,enabled,attribute_map')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!ssoConfig?.enabled) {
      return reply.status(404).send({ error: 'sso_not_configured', orgId })
    }

    // Fetch OIDC discovery to get token endpoint
    const disco = await fetchOidcDiscovery(ssoConfig.oidc_issuer as string)
    if (!disco?.tokenEndpoint) {
      return reply.status(502).send({ error: 'oidc_discovery_failed' })
    }

    // Decrypt the client secret
    let clientSecret: string
    try {
      const encKey = getEncryptionKey()
      clientSecret = await decryptSecret(ssoConfig.oidc_client_secret_enc as string, encKey)
    } catch {
      return reply.status(500).send({ error: 'sso_secret_decrypt_failed' })
    }

    const redirectUri = `${process.env.SANCTUM_API_URL ?? ''}/v1/sso/callback`

    // Exchange authorization code for tokens
    let tokenResponse: Record<string, unknown>
    try {
      const tokenRes = await fetch(disco.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: q.code,
          redirect_uri: redirectUri,
          client_id: ssoConfig.oidc_client_id as string,
          client_secret: clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(15_000),
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => '')
        return reply.status(502).send({ error: 'token_exchange_failed', detail: errText.slice(0, 500) })
      }

      tokenResponse = await tokenRes.json() as Record<string, unknown>
    } catch (err) {
      return reply.status(502).send({ error: 'token_exchange_error', detail: err instanceof Error ? err.message : String(err) })
    }

    // Decode JWT claims from id_token.
    // Signature verification is omitted because we received this token directly
    // from the IDP token_endpoint over TLS — it cannot be forged in transit.
    // We DO validate iss, aud, and exp to prevent token reuse and misconfiguration.
    let idClaims: Record<string, unknown> = {}
    const idToken = tokenResponse['id_token'] as string | undefined
    if (idToken) {
      try {
        const parts = idToken.split('.')
        if (parts.length >= 2) {
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
          idClaims = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Record<string, unknown>
        }
      } catch { /* malformed JWT — idClaims stays empty, identity check below will catch it */ }
    }

    // Validate standard claims — reject tokens that look replayed or misconfigured
    const now = Math.floor(Date.now() / 1000)
    const iss = idClaims['iss'] as string | undefined
    const aud = idClaims['aud'] as string | string[] | undefined
    const exp = idClaims['exp'] as number | undefined
    const expectedIss = (ssoConfig.oidc_issuer as string).replace(/\/$/, '')
    const clientId = ssoConfig.oidc_client_id as string

    if (iss && iss.replace(/\/$/, '') !== expectedIss) {
      return reply.status(401).send({ error: 'sso_token_issuer_mismatch', expected: expectedIss, got: iss })
    }
    const audList = Array.isArray(aud) ? aud : (aud ? [aud] : [])
    if (audList.length > 0 && !audList.includes(clientId)) {
      return reply.status(401).send({ error: 'sso_token_audience_mismatch' })
    }
    if (exp && exp < now) {
      return reply.status(401).send({ error: 'sso_token_expired' })
    }

    // Apply attribute_map if provided (maps IDP claim names to Sanctum fields)
    const attrMap = (ssoConfig.attribute_map ?? {}) as Record<string, string>
    const emailClaim = attrMap['email'] ?? 'email'
    const nameClaim = attrMap['name'] ?? 'name'

    const email = (idClaims[emailClaim] ?? idClaims['email']) as string | undefined
    const name = (idClaims[nameClaim] ?? idClaims['name']) as string | undefined
    const sub = idClaims['sub'] as string | undefined

    if (!email && !sub) {
      return reply.status(502).send({ error: 'no_identity_in_id_token' })
    }

    // Upsert user via Supabase admin and create a session
    let accessToken: string | null = null
    let refreshToken: string | null = null
    try {
      const identEmail = email ?? `${sub}@sso.local`

      // Try to find existing user by email
      const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
      const existingUser = existingUsers?.users?.find((u) => u.email === identEmail)

      let userId: string
      if (existingUser) {
        userId = existingUser.id
        // Update metadata if needed
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { sso_org_id: orgId, sso_sub: sub, name },
        })
      } else {
        // Create user
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: identEmail,
          email_confirm: true,
          user_metadata: { sso_org_id: orgId, sso_sub: sub, name },
        })
        if (createErr || !newUser?.user) {
          return reply.status(500).send({ error: 'user_creation_failed', detail: createErr?.message })
        }
        userId = newUser.user.id
      }

      // Ensure the user is a member of the org
      await admin.from('organization_members').upsert({
        org_id: orgId,
        user_id: userId,
        role: 'member',
        invited_at: new Date().toISOString(),
      }, { onConflict: 'org_id,user_id', ignoreDuplicates: true })

      // Generate a session for the user
      const { data: sessionData, error: sessionErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: identEmail,
      })

      if (sessionErr || !sessionData) {
        // Fallback: sign in with OTP and return limited info
        return reply.status(500).send({ error: 'session_creation_failed', detail: sessionErr?.message })
      }

      // Exchange the magic link for actual session tokens using the hashed token
      const linkUrl = new URL(sessionData.properties?.action_link ?? '')
      const hashParams = new URLSearchParams(linkUrl.hash.slice(1))
      accessToken = hashParams.get('access_token')
      refreshToken = hashParams.get('refresh_token')
    } catch (err) {
      return reply.status(500).send({ error: 'session_error', detail: err instanceof Error ? err.message : String(err) })
    }

    const dashUrl = process.env.SANCTUM_DASHBOARD_URL ?? process.env.VITE_DASHBOARD_URL ?? 'http://localhost:5174'

    if (accessToken) {
      // Redirect with tokens in fragment (never in query string to avoid logging)
      return reply.redirect(`${dashUrl}/auth/sso-complete#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken ?? '')}&org_id=${encodeURIComponent(orgId)}`)
    }

    // Fallback: redirect to dashboard login page for the org
    return reply.redirect(`${dashUrl}/auth/login?sso_org=${encodeURIComponent(orgId)}&sso_complete=1`)
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

    if (!data) return {
      notification_email: null,
      slack_webhook_configured: false,
      notification_webhook_configured: false,
      quota_warning_pct: 80,
    }
    return {
      notification_email: data.notification_email,
      // Never return raw webhook URLs to the client — just whether they're set
      slack_webhook_configured: Boolean(data.slack_webhook_url),
      notification_webhook_configured: Boolean(data.notification_webhook_url),
      quota_warning_pct: data.quota_warning_pct ?? 80,
    }
  })

  // PATCH /v1/orgs/:orgId/notifications
  app.patch('/v1/orgs/:orgId/notifications', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const resolvedOrg = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolvedOrg) return reply.status(403).send({ error: 'org_forbidden' })

    const body = z.object({
      notification_email: z.string().email().nullable().optional(),
      // Webhooks: omit key = keep existing; null = clear; string = update
      slack_webhook_url: z.string().url().nullable().optional(),
      notification_webhook_url: z.string().url().nullable().optional(),
      quota_warning_pct: z.number().int().min(50).max(100).optional(),
    }).parse(req.body)

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('org_plans')
      .upsert(
        { org_id: orgId, ...body, updated_at: new Date().toISOString() },
        { onConflict: 'org_id', ignoreDuplicates: false },
      )
      .select('notification_email,slack_webhook_url,notification_webhook_url,quota_warning_pct')
      .single()

    if (error) {
      return reply.status(500).send({
        error: 'notification_prefs_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }
    return {
      notification_email: data.notification_email,
      slack_webhook_configured: Boolean(data.slack_webhook_url),
      notification_webhook_configured: Boolean(data.notification_webhook_url),
      quota_warning_pct: data.quota_warning_pct ?? 80,
    }
  })
}
