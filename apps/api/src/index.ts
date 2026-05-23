import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { RuntimeEngine } from '@sanctum/runtime-engine'
import { ActionRequestSchema, PolicyConditionSchema } from '@sanctum-runtime/sdk'
import { policiesFromYaml, policiesToYaml } from '@sanctum/policy-engine'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { z } from 'zod'
import { attachHttpMetrics, recordRateLimitHit, renderHttpMetrics } from './http-metrics.js'
import { getHeapPressureRatio, startHeapWatchdog } from './heap-watchdog.js'
import { registerApiKeyRoutes } from './api-keys.js'
import { registerControlPlaneRoutes } from './control-plane-routes.js'
import { registerOrchestrationRoutes } from './orchestration-routes.js'
import { registerAgentMemoryRoutes } from './agent-memory-routes.js'
import { registerMarketplaceRoutes } from './marketplace-routes.js'
import { registerHardwareAttestationRoutes } from './hardware-attestation-routes.js'
import { registerUsageRoutes } from './usage-routes.js'
import { registerBillingRoutes } from './billing-routes.js'
import { registerExportRoutes } from './export-routes.js'
import { registerGovernanceRoutes } from './governance.js'
import { registerComplianceRoutes } from './compliance.js'
import { registerPolicyVersionRoutes } from './policy-versions.js'
import { registerDelegationRoutes } from './delegation.js'
import { startWebhookWorker } from './webhook-queue.js'
import { startEmailQueueWorker } from './email-queue-worker.js'
import { riskModelBreaker } from './circuit-breaker.js'
import { traced } from './telemetry.js'
import { sendNotificationDeduped, initDedupCache } from './notifications.js'
import { getEntitlementEngine } from './entitlements.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { registerRuntimeWsRoutes } from './runtime-ws-routes.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
import { registerAlertRoutes } from './alert-routes.js'
import { registerPushRoutes, sendPushToUser } from './push-routes.js'
import { AlertStore } from './alert-store.js'
import { sendVerificationEmail, verifyToken } from './verify-email.js'
import { loadPoliciesFromSupabase, detectAnomalies, heuristicRiskFloor, verifyActionToken } from '@sanctum/runtime-engine'
import { verifyAgentToken, extractAgentToken, registerAgentTokenRoutes } from './agent-tokens.js'
import { checkActiveGrant, createGrant } from './policy-grants.js'
import {
  authenticateRequest,
  getSupabaseAuthConfig,
  isSupabaseAuthEnabled,
} from './auth.js'
import {
  internalErrorBody,
  isProduction,
  metricsAuthorized,
} from './security.js'
import {
  assertAuditEntryScope,
  listScopedAudit,
  mergePoliciesForOrgs,
  pickScopedOrgs,
  policyStorageKey,
  resolveRouteOrgScope,
} from './scoped-policy-audit.js'
import { assertOrgAllowed, type SanctumReq } from './org-scope.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { createSupabaseAdmin } from './auth.js'
import {
  loadRepoEnv,
  resolveApiListenTarget,
  resolveDashboardUrl,
} from '../../../scripts/env.ts'

loadRepoEnv()

// Fail fast in production if required secrets are missing
if (isProduction()) {
  const missing: string[] = []
  if (!process.env.SANCTUM_ACTION_TOKEN_SECRET?.trim() && !process.env.SANCTUM_API_KEY_PEPPER?.trim() && !process.env.SANCTUM_API_KEY?.trim())
    missing.push('SANCTUM_ACTION_TOKEN_SECRET (required for signed action tokens)')
  if (!process.env.SANCTUM_API_KEY_PEPPER?.trim() && !process.env.SANCTUM_API_KEY?.trim())
    missing.push('SANCTUM_API_KEY_PEPPER (required for agent token signing)')
  if (!process.env.SUPABASE_URL?.trim())
    missing.push('SUPABASE_URL')
  if (process.env.SUPABASE_URL?.trim() && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    missing.push('SUPABASE_SERVICE_ROLE_KEY (required when SUPABASE_URL is set)')
  if (missing.length > 0) {
    console.error('FATAL: Missing required environment variables:\n  ' + missing.join('\n  '))
    process.exit(1)
  }
}

const { host, port } = resolveApiListenTarget()
const dashboardUrl = resolveDashboardUrl()
const forceOffline = process.env.SANCTUM_OFFLINE_MODE === 'true'
const apiKey = process.env.SANCTUM_API_KEY?.trim() || undefined
const supabaseAuth = getSupabaseAuthConfig()

const runtime = new RuntimeEngine({
  forceOfflineMode: forceOffline,
})

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 512 * 1024, // 512 KB
  genReqId: () => crypto.randomUUID(),
})

const corsOrigins = new Set([
  dashboardUrl,
  'https://console.sanctumruntime.com',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
])
for (const origin of process.env.SANCTUM_CORS_ORIGINS?.split(',') ?? []) {
  const trimmed = origin.trim()
  if (trimmed) corsOrigins.add(trimmed)
}

await app.register(websocket)
function isAllowedCorsOrigin(origin: string): boolean {
  if (corsOrigins.has(origin)) return true
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'https:' || parsed.port) return false
    const host = parsed.hostname
    // Exact match or strict subdomain — rejects evil-sanctumruntime.com
    return host === 'sanctumruntime.com' || /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.sanctumruntime\.com$/.test(host)
  } catch {
    return false
  }
}

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, !isProduction())
      return
    }
    cb(null, isAllowedCorsOrigin(origin))
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sanctum-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
})

await app.register(helmet, {
  contentSecurityPolicy: false,         // API, not serving HTML
  crossOriginResourcePolicy: false,     // CORS plugin handles this
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
})

function rateLimitKey(req: import('fastify').FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for']
  const ip = Array.isArray(fwd) ? fwd[0] : (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.ip)
  return ip ?? req.ip
}

// Global default — 200 req/min per IP
await app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  // No allowList — localhost bypass removed; apply limits everywhere including cloud VMs
  keyGenerator: rateLimitKey,
  errorResponseBuilder: (req, context) => {
    recordRateLimitHit()
    // Structured log so log aggregators can alert on rate-limit spikes. We
    // include the keyed bucket (IP or actor) and the route the client was
    // hitting so a single noisy client is trivially identifiable.
    req.log.warn({
      rateLimited: true,
      key: rateLimitKey(req),
      route: req.url.split('?')[0],
      limit: context.max,
      ttlMs: context.ttl,
    }, 'rate limit exceeded')
    return {
      error: 'rate_limit_exceeded',
      hint: 'Too many requests — back off and retry',
    }
  },
})

// Echo request ID in responses for traceability
// Also stamp sensitive /v1/* data endpoints as non-cacheable so no upstream
// proxy or CDN accidentally serves a prior user's data to a new caller.
app.addHook('onSend', async (req, reply) => {
  reply.header('X-Request-Id', req.id)
  const path = req.url.split('?')[0]
  if (path.startsWith('/v1/') && path !== '/v1/push/vapid-key') {
    reply.header('Cache-Control', 'no-store')
  }
})

// HTTP request counters + latency histogram + slow-request log lines
attachHttpMetrics(app)

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: 'validation_error',
      details: err.flatten(),
    })
  }
  app.log.error(err)
  return reply.status(500).send(internalErrorBody(err))
})

function isPublicPath(path: string): boolean {
  if (
    path === '/health' ||
    path === '/readiness' ||
    path === '/v1/billing/webhook' ||
    path === '/v1/verify-action' ||
    path === '/v1/push/vapid-key' ||
    path === '/.well-known/security.txt' ||
    path === '/v1/client-errors'
  ) return true
  if (path.startsWith('/v1/sso/')) return true
  if (!isProduction()) {
    if (path === '/' || path === '/metrics' || path === '/v1/status') return true
  }
  return false
}

app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'OPTIONS') return

  const path = req.url.split('?')[0]
  if (path === '/metrics' && !metricsAuthorized(req.headers)) {
    return reply.status(404).send({ error: 'not_found' })
  }
  if (isPublicPath(path)) return

  const auth = await authenticateRequest(req.headers, {
    supabase: supabaseAuth,
    apiKey,
  })

  if (!auth.ok) {
    return reply.status(401).send({
      error: 'unauthorized',
      ...(isProduction()
        ? {}
        : {
            hint: isSupabaseAuthEnabled()
              ? 'Sign in via the dashboard (Bearer JWT) or send X-Sanctum-Key'
              : 'Set X-Sanctum-Key or configure Supabase auth',
          }),
    })
  }

  if (auth.method === 'supabase') {
    ;(req as { sanctumUser?: { id: string; email?: string } }).sanctumUser = {
      id: auth.user.id,
      email: auth.user.email,
    }
  }
})

await runtime.init()
if (supabaseAuth) initDedupCache()
if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  const count = Object.keys(runtime.getPolicyEngine().getPolicies()).length
  console.log(`Supabase policy store active (${count} policies loaded/seeded)`)
}

// Realtime policy sync — keeps in-memory engine consistent across horizontal instances
if (supabaseAuth) {
  const realtimeAdmin = createSupabaseAdmin(supabaseAuth)
  realtimeAdmin
    .channel('policy-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'runtime_policies' }, () => {
      void loadPoliciesFromSupabase().then((policies) => {
        if (policies) runtime.getPolicyEngine().mergePolicies(policies)
      }).catch(() => {})
    })
    .subscribe()
  console.log('[sanctum] Realtime policy sync active')
}

const publicApiUrl =
  process.env.SANCTUM_PUBLIC_API_URL?.trim() ||
  process.env.SANCTUM_API_URL?.trim() ||
  process.env.RENDER_EXTERNAL_URL?.trim() ||
  undefined

const publicDocsUrl =
  process.env.SANCTUM_DOCS_URL?.trim() || 'https://www.sanctumruntime.com/docs'

// RFC 9116 security.txt — researchers scanning the API hostname find the
// disclosure policy without needing to know the marketing site URL.
app.get('/.well-known/security.txt', async (_req, reply) => {
  reply.type('text/plain; charset=utf-8')
  reply.header('Cache-Control', 'public, max-age=3600, must-revalidate')
  return [
    '# RFC 9116 — https://www.rfc-editor.org/rfc/rfc9116',
    'Contact: https://github.com/Matik103',
    'Contact: mailto:ops@sanctumruntime.com',
    'Expires: 2027-05-23T00:00:00.000Z',
    'Preferred-Languages: en',
    'Policy: https://github.com/Matik103/sanctum-runtime/blob/main/SECURITY.md',
    'Acknowledgments: https://github.com/Matik103/sanctum-runtime/security/advisories',
    'Canonical: https://www.sanctumruntime.com/.well-known/security.txt',
    '',
  ].join('\n')
})

// ── Frontend error telemetry ─────────────────────────────────────────────────
// Dashboard's React ErrorBoundary POSTs here when it catches a render error.
// No auth required (the browser may not have a valid session when the crash
// occurs), so we apply a tight rate limit (30/min per IP) and discard any body
// larger than 8 KiB. Errors are logged at ERROR level so they flow into the
// same structured log stream as server-side errors.
const CLIENT_ERROR_SCHEMA = z.object({
  page:       z.string().max(120).optional(),
  message:    z.string().max(500),
  stack:      z.string().max(4000).optional(),
  componentStack: z.string().max(4000).optional(),
  userAgent:  z.string().max(300).optional(),
  href:       z.string().max(500).optional(),
  buildId:    z.string().max(80).optional(),
})

app.post('/v1/client-errors', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  bodyLimit: 8 * 1024,   // 8 KiB — enough for stack traces, blocks flood payloads
}, async (req, reply) => {
  const result = CLIENT_ERROR_SCHEMA.safeParse(req.body)
  if (!result.success) {
    return reply.status(400).send({ error: 'invalid_payload' })
  }
  req.log.error({
    source:         'client',
    clientError:    true,
    page:           result.data.page,
    message:        result.data.message,
    stack:          result.data.stack,
    componentStack: result.data.componentStack,
    userAgent:      result.data.userAgent,
    href:           result.data.href,
    buildId:        result.data.buildId,
    requestId:      req.id,
  }, 'dashboard render error captured')
  return reply.status(202).send({ ok: true })
})

app.get('/', async () => {
  if (isProduction()) {
    return {
      name: 'Sanctum Runtime API',
      health: '/health',
      docs: publicDocsUrl,
    }
  }
  return {
    name: 'Sanctum Runtime API',
    version: '0.1.0',
    url: publicApiUrl,
    docs: publicDocsUrl,
    dashboard: dashboardUrl,
    auth: supabaseAuth
      ? 'Supabase JWT (Bearer) or X-Sanctum-Key'
      : apiKey
        ? 'X-Sanctum-Key required'
        : 'none (local dev)',
    endpoints: {
      health: 'GET /health',
      status: 'GET /v1/status',
      verify: 'POST /v1/actions/verify',
      audit: 'GET /v1/audit',
      resolve: 'POST /v1/audit/:id/resolve',
      verification: 'GET /v1/verifications/:correlationId',
      orgPolicies: 'GET /v1/orgs/:orgId/policies',
      policies: 'GET|POST /v1/policies',
      policyByAction: 'PATCH|DELETE /v1/policies/:action',
      policiesYaml: 'GET /v1/policies/export.yaml · POST /v1/policies/import.yaml',
      webhooks: 'GET /v1/webhooks/status',
      apiKeys: 'GET|POST /v1/api-keys · DELETE /v1/api-keys/:id',
      runtimes:
        'POST /v1/runtimes/connect · POST …/attest · GET …/trust · heartbeat/agents/events · DELETE /v1/runtimes/:id · DELETE …/agents/:agentId',
      fleet: 'GET /v1/fleet/map · deployment-groups · POST /v1/orchestration/dispatch',
      operatorContext: 'GET /v1/operator/context',
      eventStream: 'GET /v1/events/stream (SSE)',
      runtimeWs: 'WS /v1/runtimes/ws?runtimeId=',
      agentMemory: 'GET|PUT|DELETE /v1/runtimes/:id/agents/:agentId/memory/:key',
      marketplace: 'GET /v1/marketplace/packages · install · connect hints',
      usage: 'GET /v1/usage?org_id=',
      billing: 'GET /v1/billing/plan · POST /v1/billing/checkout · POST /v1/billing/webhook',
      export: 'GET /v1/orgs/:orgId/export.json · GET /v1/orgs/:orgId/export/history',
      notifications: 'GET|PATCH /v1/orgs/:orgId/notifications',
      sso: 'GET|PUT /v1/orgs/:orgId/sso · GET /v1/sso/:orgId/login',
      analyze: 'POST /analyze-action',
    },
  }
})

if (supabaseAuth) {
  await registerApiKeyRoutes(app, supabaseAuth)
  await registerControlPlaneRoutes(app)
  await registerOrchestrationRoutes(app)
  await registerRuntimeWsRoutes(app)
  await registerAgentMemoryRoutes(app)
  await registerMarketplaceRoutes(app, runtime)
  await registerUsageRoutes(app)
  await registerBillingRoutes(app)
  await registerExportRoutes(app)
  await registerHardwareAttestationRoutes(app)
  await registerPolicyVersionRoutes(app, supabaseAuth)
  await registerGovernanceRoutes(app, supabaseAuth)
  await registerComplianceRoutes(app, supabaseAuth)
  await registerDelegationRoutes(app, supabaseAuth)
  await registerAlertRoutes(app)
  await registerPushRoutes(app)
  await registerAgentTokenRoutes(app, supabaseAuth)
}

const stopWebhookWorker = supabaseAuth ? startWebhookWorker(supabaseAuth) : null

// Auto-escalation: re-push notifications for stale REQUIRE_VERIFICATION entries.
const escalationTimer = setInterval(async () => {
  try {
    const escalated = await runtime.sweepEscalations()
    if (!escalated.length || !supabaseAuth) return
    const alertStore = new AlertStore(supabaseAuth)
    for (const entry of escalated) {
      const orgId = typeof entry.context?.org_id === 'string' ? entry.context.org_id : null
      if (!orgId) continue
      void alertStore.createAlert({
        org_id: orgId,
        severity: 'critical',
        type: 'agent.verification_escalated',
        title: `Escalated: ${entry.action}`,
        message: `Verification request "${entry.action}" by ${entry.actor} has been pending past its escalation window.`,
        channels: ['push', 'email', 'slack'],
        metadata: { entryId: entry.id, blastRadius: entry.blastRadius?.level },
      }).catch(() => {})
      // Re-fire the push notification so operators get a fresh nudge
      try {
        const admin = createSupabaseAdmin(supabaseAuth)
        const { data: members } = await admin
          .from('organization_members')
          .select('user_id')
          .eq('org_id', orgId)
        await Promise.allSettled(
          (members ?? []).map((m) => sendPushToUser(m.user_id as string, {
            title: `Escalated approval: ${entry.action}`,
            body: `${entry.actor} has been waiting for review. Risk ${(entry.risk === 'high' ? 100 : entry.risk === 'medium' ? 60 : 30).toFixed(0)}%.`,
            tag: `verify:${entry.id}`,
            requireInteraction: true,
            url: `/?page=activity&verify=${encodeURIComponent(entry.id)}`,
            data: { entryId: entry.id, type: 'agent.verification_escalated', orgId, escalated: true },
          })),
        )
      } catch { /* best-effort */ }
    }
  } catch (e) {
    app.log.warn({ err: e }, 'escalation sweep failed')
  }
}, 60_000)
escalationTimer.unref?.()
const stopEmailQueueWorker = supabaseAuth ? startEmailQueueWorker(supabaseAuth) : null
const stopHeapWatchdog = startHeapWatchdog()

// Fast readiness probe
app.get('/readiness', async () => ({ ready: true }))

app.get('/health', async (_req, reply) => {
  let supabaseOk: boolean | null = null
  if (supabaseAuth) {
    try {
      const admin = createSupabaseAdmin(supabaseAuth)
      const { error } = await Promise.race([
        admin.from('organizations').select('id').limit(1),
        new Promise<{ error: Error }>((res) => setTimeout(() => res({ error: new Error('timeout') }), 3000)),
      ])
      supabaseOk = !error
    } catch {
      supabaseOk = false
    }
  }

  if (isProduction()) {
    if (supabaseAuth && !supabaseOk) {
      return reply.status(503).send({ ok: false, reason: 'supabase_unreachable' })
    }
    // Surface risk model + offline-mode in the production health response so
    // Render uptime monitors and status-page probes can detect misconfiguration
    // without needing to scrape logs or call the private /v1/status endpoint.
    const prodStatus = await runtime.getStatus()
    return {
      ok: true,
      riskModel: {
        provider: prodStatus.riskProvider,
        model: prodStatus.riskModel ?? null,
        offline: forceOffline || !prodStatus.riskModelConnected,
        connected: prodStatus.riskModelConnected,
      },
    }
  }

  const status = await runtime.getStatus()
  const webhookStatus = runtime.getWebhookStatus()
  const mem = process.memoryUsage()

  return {
    ok: status.runtimeOnline,
    riskModel: {
      provider: status.riskProvider,
      connected: status.riskModelConnected,
    },
    audit: { count: status.auditCount },
    policies: { count: status.policyCount },
    supabase: supabaseOk,
    webhooks: { configured: webhookStatus.configured },
    wsConnections: runtimeWsHub.connectedCount(),
    memory: {
      rssmb:      Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
  }
})

app.get('/v1/status', async () => runtime.getStatus())

// List orgs the caller belongs to, and ensure their personal org exists
app.get('/v1/orgs', async (req, reply) => {
  if (!supabaseAuth) return reply.send([])
  const user = (req as SanctumReq).sanctumUser
  if (!user) return reply.status(401).send({ error: 'unauthorized' })

  const store = new ControlPlaneStore(supabaseAuth)
  const admin = createSupabaseAdmin(supabaseAuth)

  // Derive personal org ID from user UUID
  const personalOrgId = 'personal-' + user.id.replace(/-/g, '').slice(0, 12)

  // Ensure personal org exists (idempotent)
  const orgUpsert = await admin.from('organizations').upsert(
    { id: personalOrgId, name: user.email ?? personalOrgId },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (orgUpsert.error) req.log.warn({ err: orgUpsert.error, personalOrgId }, 'personal org upsert failed')

  const memberUpsert = await admin.from('organization_members').upsert(
    { org_id: personalOrgId, user_id: user.id, role: 'owner' },
    { onConflict: 'org_id,user_id', ignoreDuplicates: true },
  )
  if (memberUpsert.error) req.log.warn({ err: memberUpsert.error, personalOrgId }, 'personal org member upsert failed')

  const orgIds = await store.getUserOrgIds(user.id)
  const { data: orgs } = await admin
    .from('organizations')
    .select('id,name,created_at')
    .in('id', orgIds.length ? orgIds : [personalOrgId])

  return reply.send(orgs ?? [])
})

app.get('/v1/policies', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { org_id?: string }
  const picked = pickScopedOrgs(scope, q.org_id)
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  if (scope === null && picked.orgIds.length === 0) {
    return runtime.getPolicyEngine().getPolicies()
  }
  const orgIds = picked.orgIds.length > 0 ? picked.orgIds : scope ?? []
  return mergePoliciesForOrgs(runtime, orgIds)
})

const policyPatchSchema = z.object({
  requiresVerification: z.boolean().optional(),
  autoBlock: z.boolean().optional(),
  blockWhenOffline: z.boolean().optional(),
  allowedActors: z.array(z.string()).optional(),
  riskPrompt: z.string().max(8000).optional(),
  requireSecondApprover: z.boolean().optional(),
  autoEscalateAfterMinutes: z.number().int().min(1).max(1440).optional(),
  conditions: z.array(PolicyConditionSchema).optional(),
})

const policyActionSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_.:@/-]+$/)

// Simulate what would happen for a given action — no audit log entry created.
// Returns blast radius + source trust so the dashboard simulator can show
// the operator exactly what the policy engine would have decided.
app.post('/v1/policies/simulate', async (req) => {
  const body = z
    .object({
      actor: z.string().min(1),
      action: z.string().min(1),
      context: z.record(z.unknown()).default({}),
    })
    .parse(req.body)
  const request = ActionRequestSchema.parse(body)
  return runtime.simulateAction(request)
})

// Replay historical audit entries against the current policy set.
app.get('/v1/audit/replay', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { limit?: string; org_id?: string }
  const limit = Math.min(500, Math.max(1, Number(q.limit ?? 100) || 100))
  const picked = pickScopedOrgs(scope, q.org_id)
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds.length === 1 ? picked.orgIds[0] : undefined
  return runtime.replayAudit(limit, orgId)
})

// Compliance evidence summary — SOC2 / NIST AI RMF inputs.
app.get('/v1/evidence/summary', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { limit?: string; org_id?: string }
  const limit = Math.min(500, Math.max(1, Number(q.limit ?? 200) || 200))
  const picked = pickScopedOrgs(scope, q.org_id)
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds.length === 1 ? picked.orgIds[0] : undefined
  return runtime.evidenceSummary(limit, orgId)
})

// Verify a signed Sanctum action token (executors call this before running).
app.post('/v1/actions/token/verify', async (req, reply) => {
  const body = z.object({ token: z.string().min(1) }).parse(req.body)
  const payload = verifyActionToken(body.token)
  if (!payload) return reply.status(400).send({ valid: false, error: 'invalid_or_expired_action_token' })
  return { valid: true, payload }
})

app.post('/v1/policies', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const body = z
    .object({
      action: policyActionSchema,
      org_id: z.string().min(1).max(128).optional(),
    })
    .merge(policyPatchSchema)
    .parse(req.body)
  const picked = pickScopedOrgs(scope, body.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds[0]
  const { action, org_id: _org, ...patch } = body
  const key = policyStorageKey(action, orgId, scope)
  return runtime.getPolicyEngine().createPolicy(key, patch)
})

app.patch('/v1/policies/:action', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const action = policyActionSchema.parse((req.params as { action: string }).action)
  const q = req.query as { org_id?: string }
  const body = policyPatchSchema.parse(req.body)
  const picked = pickScopedOrgs(scope, q.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const key = policyStorageKey(action, picked.orgIds[0], scope)
  return await runtime.getPolicyEngine().updatePolicy(key, body)
})

app.delete('/v1/policies/:action', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const action = policyActionSchema.parse((req.params as { action: string }).action)
  const q = req.query as { org_id?: string }
  const picked = pickScopedOrgs(scope, q.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const key = policyStorageKey(action, picked.orgIds[0], scope)
  return runtime.getPolicyEngine().deletePolicy(key)
})

app.get('/v1/policies/export.yaml', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { org_id?: string }
  if (scope === null && !q.org_id) {
    return reply.type('text/yaml; charset=utf-8').send(runtime.exportPoliciesYaml())
  }
  const picked = pickScopedOrgs(scope, q.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  return reply
    .type('text/yaml; charset=utf-8')
    .send(policiesToYaml(runtime.getPoliciesForOrg(picked.orgIds[0])))
})

app.post('/v1/policies/import.yaml', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const body = z
    .object({
      yaml: z.string().min(1),
      merge: z.boolean().optional().default(true),
      org_id: z.string().min(1).max(128).optional(),
    })
    .parse(req.body)
  if (scope === null && !body.org_id) {
    return runtime.importPoliciesYaml(body.yaml, body.merge)
  }
  const picked = pickScopedOrgs(scope, body.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds[0]
  const imported = policiesFromYaml(body.yaml)
  const validatedPolicies = Object.entries(imported).map(
    ([action, policy]) => [policyActionSchema.parse(action), policy] as const,
  )
  if (!body.merge) {
    await runtime.removePolicyKeys(
      Object.keys(runtime.getPoliciesForOrg(orgId)).map((action) => `${orgId}:${action}`),
    )
  }
  for (const [action, policy] of validatedPolicies) {
    await runtime.getPolicyEngine().createPolicy(policyStorageKey(action, orgId, scope), policy)
  }
  return mergePoliciesForOrgs(runtime, [orgId])
})

app.get('/v1/webhooks/status', async () => runtime.getWebhookStatus())

app.get('/v1/audit', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { limit?: string; org_id?: string }
  const limit = Math.min(500, Math.max(1, Number(q.limit ?? 50) || 50))
  const picked = pickScopedOrgs(scope, q.org_id)
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  return listScopedAudit(runtime, limit, picked.orgIds, scope)
})

app.get('/v1/verifications/:correlationId', async (req, reply) => {
  const { correlationId } = req.params as { correlationId: string }
  const status = runtime.getVerificationStatus(correlationId)
  if (!status) return reply.status(404).send({ error: 'not_found' })
  // Scope-check: caller must belong to the org that owns this action
  const entryOrgId = typeof status.context?.org_id === 'string' ? status.context.org_id : undefined
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  if (!assertAuditEntryScope(scope, entryOrgId, reply)) return
  return status
})

app.get('/v1/orgs/:orgId/policies', async (req, reply) => {
  const { orgId } = req.params as { orgId: string }
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  if (!assertOrgAllowed(scope, orgId, reply)) return
  return runtime.getPoliciesForOrg(orgId)
})

app.post('/v1/audit/:id/resolve', {
  config: { rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: rateLimitKey } },
}, async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = z
    .object({
      decision: z.enum(['APPROVED', 'BLOCKED']),
      resolvedBy: z.string().optional(),
      note: z.string().optional(),
      grantDurationMinutes: z.number().int().min(1).max(480).optional(), // up to 8 hours
    })
    .parse(req.body)

  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const entry = runtime.getAuditStore().getById(id)
  const entryOrgId =
    entry && typeof entry.context?.org_id === 'string' ? entry.context.org_id : undefined
  if (!assertAuditEntryScope(scope, entryOrgId, reply)) return

  const result = await runtime.resolveAuditEntry(id, body)
  if (!result) {
    return reply.status(404).send({ error: 'audit_entry_not_found' })
  }

  // Create a time-bounded grant so the agent isn't re-interrupted during the window
  if (
    body.decision === 'APPROVED' &&
    body.grantDurationMinutes &&
    supabaseAuth &&
    entryOrgId
  ) {
    const who = body.resolvedBy ?? 'operator'
    void createGrant(
      supabaseAuth,
      entryOrgId,
      result.action,
      result.actor,
      who,
      body.grantDurationMinutes,
    ).catch(() => {})
  }

  return result
})

app.post('/v1/audit/:id/execution', async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = z
    .object({
      actionToken: z.string().min(16),
      status: z.enum(['succeeded', 'failed', 'skipped']),
      reportedBy: z.string().max(256).optional(),
      resultSummary: z.string().max(2000).optional(),
      outputRef: z.string().max(1000).optional(),
      error: z.string().max(2000).optional(),
      durationMs: z.number().nonnegative().optional(),
    })
    .parse(req.body)

  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const entry = runtime.getAuditStore().getById(id)
  const entryOrgId =
    entry && typeof entry.context?.org_id === 'string' ? entry.context.org_id : undefined
  if (!assertAuditEntryScope(scope, entryOrgId, reply)) return

  try {
    const result = await runtime.reportActionExecution(id, body)
    if (!result) return reply.status(404).send({ error: 'audit_entry_not_found' })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'execution_report_failed'
    if (
      message === 'invalid_action_token' ||
      message === 'action_token_scope_mismatch'
    ) {
      return reply.status(401).send({ error: message })
    }
    if (message === 'execution_report_requires_approved_action') {
      return reply.status(409).send({ error: message })
    }
    throw err
  }
})

// Tighter per-endpoint rate limits applied as route-level config
app.post('/v1/actions/verify', {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (req: import('fastify').FastifyRequest) => {
        // Rate-limit per actor field in body if present, otherwise fall back to IP
        const body = req.body as Record<string, unknown> | null
        const actor = typeof body?.actor === 'string' ? body.actor : null
        const fwd = req.headers['x-forwarded-for']
        const ip = Array.isArray(fwd) ? fwd[0] : (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.ip)
        return actor ? `actor:${actor}` : (ip ?? req.ip)
      },
    },
  },
}, async (req, reply) => {
  const body = z
    .object({
      actor: z.string().max(512),
      action: z.string().max(512),
      context: z.record(z.unknown()).default({}),
      offlineMode: z.boolean().optional(),
      correlationId: z.string().optional(),
    })
    .parse(req.body)

  // Agent token: if present and valid, org_id is extracted from the signed token
  // rather than trusted from context (prevents org impersonation)
  const agentTokenRaw = extractAgentToken(req as { headers: Record<string, string | string[] | undefined> })
  const agentClaims = agentTokenRaw ? verifyAgentToken(agentTokenRaw) : null
  if (agentTokenRaw && !agentClaims) {
    return reply.status(401).send({ error: 'invalid_agent_token' })
  }

  // Confirm token is not revoked (HMAC alone is insufficient — must check DB)
  if (agentClaims && supabaseAuth) {
    const adminClient = createSupabaseAdmin(supabaseAuth)
    const revocationCheck = adminClient
      .from('agent_registrations')
      .select('id')
      .eq('id', agentClaims.id)
      .is('revoked_at', null)
      .maybeSingle()
    const { data: reg } = await Promise.race([
      revocationCheck,
      new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 2000)),
    ])
    if (!reg) return reply.status(401).send({ error: 'agent_token_revoked' })
    void adminClient
      .from('agent_registrations')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', agentClaims.id)
      .then(() => {})
  }

  const request = ActionRequestSchema.parse({
    actor: body.actor,
    action: body.action,
    // Inject verified org_id so policy engine scopes correctly
    context: agentClaims
      ? { ...body.context, org_id: agentClaims.orgId }
      : body.context,
  })

  // orgId from token takes precedence over self-reported context value
  const orgId = agentClaims?.orgId ??
    (typeof body.context?.org_id === 'string' ? body.context.org_id : undefined)

  // Fleet kill-switch: if the org has paused all agent actions, block immediately
  if (orgId && supabaseAuth) {
    try {
      const adminClient = createSupabaseAdmin(supabaseAuth)
      const { data: org } = await Promise.race([
        adminClient.from('organizations').select('fleet_paused').eq('id', orgId).single(),
        new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 2000)),
      ])
      if (org?.fleet_paused) {
        return reply.status(200).send({
          id: crypto.randomUUID(),
          correlationId: body.correlationId ?? crypto.randomUUID(),
          actor: body.actor,
          action: body.action,
          context: request.context,
          decision: 'BLOCKED',
          risk: 'high',
          reasoning: 'Fleet is paused by operator. All agent actions are suspended until the fleet is resumed.',
          policyPath: 'fleet:paused',
          anomalyFlags: ['fleet_paused'],
          modelInvoked: false,
          modelConfidence: null,
          timestamp: new Date().toISOString(),
        })
      }
    } catch { /* non-fatal — fall through to normal verification */ }
  }

  let result = await traced(
    'action.verify',
    { actor: body.actor, action: body.action, org_id: orgId ?? '' },
    async (span) => {
      const r = await riskModelBreaker.call(() =>
        runtime.verifyAction(request, {
          offlineMode: body.offlineMode,
          correlationId: body.correlationId,
        })
      )
      span.end({ decision: r.decision, risk: r.risk, anomaly_flags: r.anomalyFlags.join(',') })
      return r
    },
    req.id,
  )

  // Time-bounded grant: if a previous approval granted this action for a window,
  // auto-approve without interrupting the agent again
  if (result.decision === 'REQUIRE_VERIFICATION' && supabaseAuth && orgId) {
    try {
      const grant = await checkActiveGrant(supabaseAuth, orgId, body.action, body.actor)
      if (grant) {
        const expiresStr = new Date(grant.expires_at).toLocaleTimeString()
        const resolved = await runtime.resolveAuditEntry(result.id, {
          decision: 'APPROVED',
          resolvedBy: `grant:${grant.granted_by}`,
          note: `Auto-approved by time-bounded grant (active until ${expiresStr})`,
        })
        if (resolved) result = resolved
      }
    } catch { /* non-fatal — fall through to normal verification flow */ }
  }

  recordUsage(supabaseAuth, orgId, UsageMetrics.ACTION_VERIFY, 1, {
    action: body.action,
    decision: result.decision,
  })

  // Quota warning / exceeded — fire-and-forget, no impact on verify latency
  if (supabaseAuth && orgId) {
    const entEngine = getEntitlementEngine(supabaseAuth)
    void entEngine.checkEventQuota(orgId).then(async (quota) => {
      if (quota.limit === null) return
      const prefs = await entEngine.getNotificationPrefs(orgId)
      const warnThreshold = Math.floor(quota.limit * (prefs.quotaWarningPct / 100))
      const usedPct = Math.round((quota.used / quota.limit) * 100)
      if (quota.used >= quota.limit) {
        sendNotificationDeduped(
          {
            type: 'quota.exceeded',
            orgId,
            title: 'Event quota exceeded',
            body: `Your organisation has used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} events this month. Further actions may be blocked. Upgrade your plan to continue.`,
            severity: 'critical',
            data: { used: quota.used, limit: quota.limit, pct: usedPct },
          },
          { email: prefs.email, slackWebhookUrl: prefs.slackWebhookUrl, notificationWebhookUrl: prefs.notificationWebhookUrl },
          3_600_000, // 1h cooldown — repeat hourly until resolved
        )
      } else if (quota.used >= warnThreshold) {
        sendNotificationDeduped(
          {
            type: 'quota.warning',
            orgId,
            title: `Approaching event quota (${usedPct}% used)`,
            body: `Your organisation has used ${quota.used.toLocaleString()} of ${quota.limit.toLocaleString()} events this month. Upgrade before you hit the limit.`,
            severity: 'warning',
            data: { used: quota.used, limit: quota.limit, pct: usedPct },
          },
          { email: prefs.email, slackWebhookUrl: prefs.slackWebhookUrl, notificationWebhookUrl: prefs.notificationWebhookUrl },
          21_600_000, // 6h cooldown
        )
      }
    }).catch(() => { /* best-effort */ })
  }

  // Persist alert + notify on anomaly spikes (BLOCKED or anomaly flags present)
  if (supabaseAuth && orgId && (result.decision === 'BLOCKED' || result.anomalyFlags.length > 0)) {
    const severity = result.decision === 'BLOCKED' ? 'critical' : 'warning'
    const eventType = result.decision === 'BLOCKED' ? 'agent.blocked_action' : 'anomaly.spike'
    const title = result.decision === 'BLOCKED'
      ? `Action blocked: ${body.action}`
      : `Anomaly detected: ${body.action}`
    const message = `Actor "${body.actor}" triggered ${result.anomalyFlags.join(', ') || 'a block'} on action "${body.action}". Decision: ${result.decision}. Risk: ${(result.risk * 100).toFixed(0)}%.`
    const metadata = { action: body.action, actor: body.actor, decision: result.decision, risk: result.risk, anomalyFlags: result.anomalyFlags }

    // Persist to alerts table (always)
    const alertStore = new AlertStore(supabaseAuth)
    void alertStore.createAlert({
      org_id: orgId,
      severity,
      type: eventType,
      title,
      message,
      channels: ['email', 'slack', 'webhook'],
      metadata,
    }).catch(() => { /* best-effort */ })

    // Send outbound notification (deduplicated per org, 5-min cooldown)
    const entEngine = getEntitlementEngine(supabaseAuth)
    void entEngine.getNotificationPrefs(orgId).then((prefs) => {
      sendNotificationDeduped(
        { type: eventType, orgId, title, body: message, severity, data: metadata },
        { email: prefs.email, slackWebhookUrl: prefs.slackWebhookUrl, notificationWebhookUrl: prefs.notificationWebhookUrl },
        300_000,
      )
    }).catch(() => { /* best-effort */ })
  }


  // Alert + email when agent requires human verification
  if (result.decision === 'REQUIRE_VERIFICATION' && supabaseAuth && orgId) {
    const alertStore = new AlertStore(supabaseAuth)
    void alertStore.createAlert({
      org_id: orgId,
      severity: 'warning',
      type: 'agent.require_verification',
      title: `Verification required: ${body.action}`,
      message: `${body.actor} wants to perform "${body.action}" and is waiting for your approval.`,
      channels: ['in_app', 'email'],
      metadata: { action: body.action, actor: body.actor, risk: result.risk, entryId: result.id },
    }).catch(() => {})

    const entEngine = getEntitlementEngine(supabaseAuth)
    void entEngine.getNotificationPrefs(orgId).then(async (prefs) => {
      if (prefs.email) {
        await sendVerificationEmail({
          to: prefs.email,
          actionId: result.id,
          actor: body.actor,
          action: body.action,
          context: body.context,
          risk: result.risk,
          publicApiUrl: publicApiUrl ?? `http://localhost:${port}`,
        })
      }
    }).catch(() => {})

    // Push notification to all org members' PWA devices — taps deep-link to the verify queue
    void (async () => {
      try {
        const admin = createSupabaseAdmin(supabaseAuth)
        const { data: members } = await admin
          .from('organization_members')
          .select('user_id')
          .eq('org_id', orgId)
        if (!members?.length) return
        await Promise.allSettled(
          members.map((m) => sendPushToUser(m.user_id as string, {
            title: `Verification required: ${body.action}`,
            body: `${body.actor} is waiting on your approval (risk ${(result.risk * 100).toFixed(0)}%).`,
            tag: `verify:${result.id}`,
            requireInteraction: true,
            url: `/?page=activity&verify=${encodeURIComponent(result.id)}`,
            data: { entryId: result.id, type: 'agent.require_verification', orgId },
          })),
        )
      } catch { /* best-effort */ }
    })()
  }

  return result
})

// ── Fleet kill-switch endpoints ───────────────────────────────────────────────

app.get('/v1/fleet/pause-status', async (req, reply) => {
  if (!supabaseAuth) return reply.status(501).send({ error: 'supabase_required' })
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const q = req.query as { org_id?: string }
  const picked = pickScopedOrgs(scope, q.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds[0]
  const admin = createSupabaseAdmin(supabaseAuth)
  const { data: org } = await admin
    .from('organizations')
    .select('fleet_paused,fleet_paused_at,fleet_paused_by')
    .eq('id', orgId)
    .single()
  if (!org) return reply.status(404).send({ error: 'org_not_found' })
  return { paused: !!org.fleet_paused, pausedAt: org.fleet_paused_at, pausedBy: org.fleet_paused_by }
})

app.post('/v1/fleet/pause', async (req, reply) => {
  if (!supabaseAuth) return reply.status(501).send({ error: 'supabase_required' })
  const user = (req as SanctumReq).sanctumUser
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const body = z.object({ org_id: z.string().min(1).optional() }).parse(req.body ?? {})
  const picked = pickScopedOrgs(scope, body.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds[0]
  const admin = createSupabaseAdmin(supabaseAuth)
  const { error } = await admin
    .from('organizations')
    .update({
      fleet_paused: true,
      fleet_paused_at: new Date().toISOString(),
      fleet_paused_by: user?.id ?? user?.email ?? 'operator',
    })
    .eq('id', orgId)
  if (error) return reply.status(500).send({ error: 'update_failed' })
  return { paused: true, pausedAt: new Date().toISOString(), pausedBy: user?.id ?? 'operator' }
})

app.post('/v1/fleet/resume', async (req, reply) => {
  if (!supabaseAuth) return reply.status(501).send({ error: 'supabase_required' })
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  const body = z.object({ org_id: z.string().min(1).optional() }).parse(req.body ?? {})
  const picked = pickScopedOrgs(scope, body.org_id, { requireSingle: true })
  if ('status' in picked) return reply.status(picked.status).send(picked.body)
  const orgId = picked.orgIds[0]
  const admin = createSupabaseAdmin(supabaseAuth)
  const { error } = await admin
    .from('organizations')
    .update({ fleet_paused: false, fleet_paused_at: null, fleet_paused_by: null })
    .eq('id', orgId)
  if (error) return reply.status(500).send({ error: 'update_failed' })
  return { paused: false }
})

// ── End fleet kill-switch ─────────────────────────────────────────────────────

// One-time email approve/deny link (no auth — HMAC token is the proof)
// Rate-limited to 10/min per IP to prevent token brute-force
app.get('/v1/verify-action', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: rateLimitKey } },
}, async (req, reply) => {
  const { token } = req.query as { token?: string }
  if (!token) return reply.status(400).send({ error: 'missing_token' })
  const parsed = verifyToken(token)
  if (!parsed) return reply.status(400).send({ error: 'invalid_or_expired_token' })
  const result = await runtime.resolveAuditEntry(parsed.id, {
    decision: parsed.decision,
    resolvedBy: 'email-link',
  })
  if (!result) return reply.status(404).send({ error: 'verification_not_found' })
  const verb = parsed.decision === 'APPROVED' ? 'Approved' : 'Blocked'
  const color = parsed.decision === 'APPROVED' ? '#10b981' : '#ef4444'
  const icon = parsed.decision === 'APPROVED' ? '✓' : '✗'
  const escHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  return reply.type('text/html').send(
    `<!DOCTYPE html><html><body style="background:#070b14;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;color:#f9fafb;max-width:400px;padding:2rem"><div style="font-size:56px;margin-bottom:12px">${icon}</div><h1 style="color:${color};margin:0 0 12px;font-size:28px">${verb}</h1><p style="color:#9ca3af;margin:0 0 8px">Action <strong style="color:#f9fafb">${escHtml(result.action)}</strong> has been ${verb.toLowerCase()}.</p><p style="color:#6b7280;font-size:13px">You can close this tab.</p></div></body></html>`
  )
})

app.post('/analyze-action', async (req) => {
  const body = z
    .object({
      actor: z.string().min(1),
      action: z.string(),
      context: z.union([z.record(z.unknown()), z.string()]).optional(),
    })
    .parse(req.body)

  const context =
    typeof body.context === 'string'
      ? { description: body.context }
      : (body.context ?? {})

  // Use simulation path — no audit log entry written
  const request = ActionRequestSchema.parse({ actor: body.actor, action: body.action, context })
  const anomalyFlags = detectAnomalies(request)
  const policyEval = runtime.getPolicyEngine().evaluate(request, false)
  const risk = heuristicRiskFloor(request, anomalyFlags)
  let decision: 'APPROVED' | 'BLOCKED' | 'REQUIRE_VERIFICATION' = 'APPROVED'
  if (policyEval.violations.includes('policy_auto_block') || policyEval.violations.includes('condition_auto_block')) {
    decision = 'BLOCKED'
  } else if (policyEval.policy.requiresVerification || risk === 'high' || risk === 'medium' || anomalyFlags.length > 0) {
    decision = 'REQUIRE_VERIFICATION'
  }

  return {
    risk,
    reason: policyEval.policy.reasoning ?? '',
    recommendation: decision === 'APPROVED' ? 'approve' : decision === 'BLOCKED' ? 'block' : 'require_verification',
    decision,
    anomalyFlags,
    offlineMode: false,
  }
})

// Prometheus-format metrics, hidden unless a metrics secret authorizes scraping.
app.get('/metrics', async (_req, reply) => {
  const status = await runtime.getStatus()
  const policies = runtime.getPolicyEngine().getPolicies()
  const policyCount = Object.keys(policies).length
  const mem = process.memoryUsage()
  const rssMb      = Math.round(mem.rss / 1024 / 1024)
  const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024)
  const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024)
  const externalMb = Math.round(mem.external / 1024 / 1024)
  const lines = [
    '# HELP sanctum_audit_entries_total Total audit entries in memory',
    '# TYPE sanctum_audit_entries_total gauge',
    `sanctum_audit_entries_total ${status.auditCount}`,
    '# HELP sanctum_audit_evictions_total Audit entries dropped from the in-memory cap since boot',
    '# TYPE sanctum_audit_evictions_total counter',
    `sanctum_audit_evictions_total ${runtime.getAuditStore().getEvictionStats().total}`,
    '# HELP sanctum_audit_cap Configured in-memory audit entry cap',
    '# TYPE sanctum_audit_cap gauge',
    `sanctum_audit_cap ${runtime.getAuditStore().getEvictionStats().cap}`,
    '# HELP sanctum_policies_total Active policy count',
    '# TYPE sanctum_policies_total gauge',
    `sanctum_policies_total ${policyCount}`,
    '# HELP sanctum_ws_connections_active Active WebSocket runtime connections',
    '# TYPE sanctum_ws_connections_active gauge',
    `sanctum_ws_connections_active ${runtimeWsHub.connectedCount()}`,
    '# HELP sanctum_risk_model_up Risk model connectivity (1=up 0=down)',
    '# TYPE sanctum_risk_model_up gauge',
    `sanctum_risk_model_up ${(status.riskModelConnected || status.ollamaConnected) ? 1 : 0}`,
    '# HELP sanctum_runtime_up Runtime engine status (1=online 0=offline)',
    '# TYPE sanctum_runtime_up gauge',
    `sanctum_runtime_up ${status.runtimeOnline ? 1 : 0}`,
    '# HELP sanctum_process_rss_mb Resident set size in MiB',
    '# TYPE sanctum_process_rss_mb gauge',
    `sanctum_process_rss_mb ${rssMb}`,
    '# HELP sanctum_process_heap_used_mb V8 heap used in MiB',
    '# TYPE sanctum_process_heap_used_mb gauge',
    `sanctum_process_heap_used_mb ${heapUsedMb}`,
    '# HELP sanctum_process_heap_total_mb V8 heap total in MiB',
    '# TYPE sanctum_process_heap_total_mb gauge',
    `sanctum_process_heap_total_mb ${heapTotalMb}`,
    '# HELP sanctum_process_external_mb V8 external memory in MiB',
    '# TYPE sanctum_process_external_mb gauge',
    `sanctum_process_external_mb ${externalMb}`,
    '# HELP sanctum_process_heap_pressure_ratio used_heap_size / heap_size_limit (0–1)',
    '# TYPE sanctum_process_heap_pressure_ratio gauge',
    `sanctum_process_heap_pressure_ratio ${getHeapPressureRatio().toFixed(4)}`,
    ...renderHttpMetrics(),
  ]
  return reply.type('text/plain; version=0.0.4; charset=utf-8').send(lines.join('\n') + '\n')
})

try {
  await app.listen({ port, host })
  logStartupSummary({ host, port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

/**
 * Emit a single structured startup banner so Render's log stream (and any
 * log aggregator) gets the full configuration state at boot — no more
 * grepping across a dozen scattered console.log lines to figure out why
 * the risk model is offline or why email isn't delivering.
 */
function logStartupSummary({ host, port }: { host: string; port: number }): void {
  const env = isProduction() ? 'production' : 'development'

  // ── Auth ─────────────────────────────────────────────────────────────────
  const hasSupabaseJwt = !!supabaseAuth
  const hasServiceRole  = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const hasApiKey       = !!apiKey

  // ── API key pepper ────────────────────────────────────────────────────────
  const pepper = process.env.SANCTUM_API_KEY_PEPPER?.trim()
  const pepperState = pepper && pepper.length >= 16
    ? 'SANCTUM_API_KEY_PEPPER  ✓'
    : hasServiceRole
      ? 'derived from SUPABASE_SERVICE_ROLE_KEY'
      : isProduction()
        ? 'MISSING — set SANCTUM_API_KEY_PEPPER'
        : 'dev default'

  // ── Risk model ────────────────────────────────────────────────────────────
  const riskProvider = process.env.SANCTUM_RISK_PROVIDER ?? 'none'
  const riskModel    = process.env.SANCTUM_RISK_MODEL ?? '(default)'
  const offlineMode  = process.env.SANCTUM_OFFLINE_MODE === 'true'
  const hasOpenAI    = !!process.env.OPENAI_API_KEY?.trim()

  // ── Optional integrations ─────────────────────────────────────────────────
  const hasResend     = !!process.env.RESEND_API_KEY?.trim()
  const hasVapid      = !!process.env.VAPID_PUBLIC_KEY?.trim() && !!process.env.VAPID_PRIVATE_KEY?.trim()
  const hasPaddle     = !!process.env.PADDLE_WEBHOOK_SECRET?.trim()
  const paddleSandbox = process.env.PADDLE_SANDBOX === 'true'

  // ── CORS ──────────────────────────────────────────────────────────────────
  const origins = Array.from(corsOrigins)
  const corsDisplay = origins.length <= 2
    ? origins.join(', ')
    : `${origins.slice(0, 2).join(', ')} + ${origins.length - 2} more`

  const W = 66 // banner inner width
  const pad = (s: string) => ('  ' + s).padEnd(W)
  const hr  = '─'.repeat(W)

  const ok  = (v: boolean, label?: string) => v ? `✓${label ? ' ' + label : ''}` : `✗ NOT SET`

  const lines = [
    `┌${hr}┐`,
    pad(`Sanctum Runtime API  [${env}]`),
    `├${hr}┤`,
    pad(`Listening     : http://${host}:${port}`),
    pad(`Risk model    : ${riskProvider} / ${riskModel}  offline=${offlineMode}  openai-key=${ok(hasOpenAI)}`),
    pad(`Supabase      : url=${ok(hasSupabaseJwt)}  service-role=${ok(hasServiceRole)}  jwt-auth=${ok(hasSupabaseJwt)}`),
    pad(`Email (Resend): ${ok(hasResend)}`),
    pad(`Push (VAPID)  : ${ok(hasVapid)}`),
    pad(`Billing Paddle: ${ok(hasPaddle)}${hasPaddle ? `  sandbox=${paddleSandbox}` : ''}`),
    pad(`Auth          : ${[hasSupabaseJwt ? 'Supabase JWT' : '', hasApiKey ? 'X-Sanctum-Key' : ''].filter(Boolean).join(' + ') || 'none (open)'}`),
    pad(`API key pepper: ${pepperState}`),
    pad(`CORS origins  : ${corsDisplay}`),
    pad(`Workers       : webhook=${ok(!!stopWebhookWorker)}  email-queue=${ok(!!stopEmailQueueWorker)}`),
    `└${hr}┘`,
  ]
  console.log(lines.join('\n'))

  // Emit targeted warnings for missing production integrations
  if (isProduction()) {
    if (!hasResend)
      console.warn('[startup] WARN: RESEND_API_KEY not set — alert emails will not be delivered')
    if (!hasVapid)
      console.warn('[startup] WARN: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications disabled')
    if (!hasPaddle)
      console.warn('[startup] WARN: PADDLE_WEBHOOK_SECRET not set — billing webhooks will be rejected')
    if (!hasOpenAI && riskProvider === 'openai' && !offlineMode)
      console.warn('[startup] WARN: OPENAI_API_KEY not set but SANCTUM_RISK_PROVIDER=openai — will run offline')
    if (!pepper || pepper.length < 16)
      console.warn('[startup] WARN: SANCTUM_API_KEY_PEPPER not set — API key security degraded')
  }
}

// Graceful shutdown:
//   1. Stop accepting new connections (app.close stops the listener)
//   2. Drain in-flight requests (Fastify awaits onClose hooks)
//   3. Stop background workers
//   4. Hard-exit after SHUTDOWN_GRACE_MS even if anything hangs — Render's
//      stopSignal grace is 30s, after which it sends SIGKILL anyway and we
//      lose the chance to log a clean exit
//
// Idempotent: if SIGTERM arrives twice (e.g. Render impatient retry), the
// second call short-circuits instead of double-closing the server.
const SHUTDOWN_GRACE_MS = 25_000
let shuttingDown = false

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    console.log(`[shutdown] ${signal} received during shutdown — ignoring`)
    return
  }
  shuttingDown = true
  console.log(`[shutdown] ${signal} received — draining`)

  const hardExit = setTimeout(() => {
    console.error(`[shutdown] grace period (${SHUTDOWN_GRACE_MS}ms) exceeded — forcing exit`)
    process.exit(1)
  }, SHUTDOWN_GRACE_MS)
  hardExit.unref()

  try {
    // app.close() stops accepting new conns and awaits in-flight handlers
    await app.close()
    stopWebhookWorker?.()
    stopEmailQueueWorker?.()
    stopHeapWatchdog()
    console.log('[shutdown] drained cleanly')
    clearTimeout(hardExit)
    process.exit(0)
  } catch (err) {
    console.error('[shutdown] error during drain:', err)
    clearTimeout(hardExit)
    process.exit(1)
  }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

// Surface unhandled errors instead of crashing silently or — worse — leaving
// the process in a half-dead state where Render's healthcheck still passes
// but requests hang. Log + exit-on-uncaught is the Node 20+ default; we add
// structured logging so the line shows up correctly in Render's log stream.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[fatal] unhandledRejection', {
    reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
    promise: String(promise),
  })
})

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException', { message: err.message, stack: err.stack })
  // Hand off to graceful shutdown so in-flight requests get a chance to finish
  // before the container is replaced. shutdown() owns the exit; the hard-exit
  // timer inside it guarantees we won't get stuck even if drain hangs.
  void shutdown('uncaughtException')
})
