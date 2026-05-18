import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { RuntimeEngine } from '@sanctum/runtime-engine'
import { ActionRequestSchema } from '@sanctum-runtime/sdk'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { z } from 'zod'
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
import { riskModelBreaker } from './circuit-breaker.js'
import { traced } from './telemetry.js'
import { sendNotificationDeduped } from './notifications.js'
import { getEntitlementEngine } from './entitlements.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { registerRuntimeWsRoutes } from './runtime-ws-routes.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
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
import {
  loadRepoEnv,
  resolveApiListenTarget,
  resolveDashboardUrl,
} from '../../../scripts/env.ts'

loadRepoEnv()
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
  'https://sanctum-dashboard.onrender.com',
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
    const host = new URL(origin).hostname
    return host === 'sanctumruntime.com' || host.endsWith('.sanctumruntime.com')
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

await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1', '::1'],
  keyGenerator: (req) => {
    const fwd = req.headers['x-forwarded-for']
    const ip = Array.isArray(fwd) ? fwd[0] : (typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.ip)
    return ip ?? req.ip
  },
  errorResponseBuilder: () => ({
    error: 'rate_limit_exceeded',
    hint: 'Too many requests — back off and retry',
  }),
})

// Echo request ID in responses for traceability
app.addHook('onSend', async (req, reply) => {
  reply.header('X-Request-Id', req.id)
})

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
  if (path === '/health' || path === '/v1/billing/webhook') return true
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
if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  const count = Object.keys(runtime.getPolicyEngine().getPolicies()).length
  console.log(`Supabase policy store active (${count} policies loaded/seeded)`)
}

const publicApiUrl =
  process.env.SANCTUM_PUBLIC_API_URL?.trim() ||
  process.env.SANCTUM_API_URL?.trim() ||
  process.env.RENDER_EXTERNAL_URL?.trim() ||
  undefined

const publicDocsUrl =
  process.env.SANCTUM_DOCS_URL?.trim() || 'https://www.sanctumruntime.com/docs'

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
    auth: supabaseAuth ? 'Supabase JWT or X-Sanctum-Key' : apiKey ? 'X-Sanctum-Key' : 'none (local dev)',
    endpoints: {
      health: 'GET /health',
      status: 'GET /v1/status',
      verify: 'POST /v1/actions/verify',
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
}

const stopWebhookWorker = supabaseAuth ? startWebhookWorker(supabaseAuth) : null

app.get('/health', async () => {
  if (isProduction()) {
    return { ok: true }
  }

  const status = await runtime.getStatus()
  const webhookStatus = runtime.getWebhookStatus()

  let supabaseOk: boolean | null = null
  if (supabaseAuth) {
    try {
      const { createSupabaseAdmin } = await import('./auth.js')
      const admin = createSupabaseAdmin(supabaseAuth)
      const { error } = await admin.from('organizations').select('id').limit(1)
      supabaseOk = !error
    } catch {
      supabaseOk = false
    }
  }

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
  }
})

app.get('/v1/status', async () => runtime.getStatus())

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
})

const policyActionSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_.:@/-]+$/)

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
  if (scope !== null) {
    return reply.status(403).send({ error: 'org_scoped_export_forbidden' })
  }
  return reply.type('text/yaml; charset=utf-8').send(runtime.exportPoliciesYaml())
})

app.post('/v1/policies/import.yaml', async (req, reply) => {
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  if (scope !== null) {
    return reply.status(403).send({ error: 'org_scoped_import_forbidden' })
  }
  const body = z
    .object({
      yaml: z.string().min(1),
      merge: z.boolean().optional().default(true),
    })
    .parse(req.body)
  return runtime.importPoliciesYaml(body.yaml, body.merge)
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

app.get('/v1/verifications/:correlationId', async (req) => {
  const { correlationId } = req.params as { correlationId: string }
  return runtime.getVerificationStatus(correlationId)
})

app.get('/v1/orgs/:orgId/policies', async (req, reply) => {
  const { orgId } = req.params as { orgId: string }
  const scope = await resolveRouteOrgScope(req as SanctumReq, supabaseAuth)
  if (!assertOrgAllowed(scope, orgId, reply)) return
  return runtime.getPoliciesForOrg(orgId)
})

app.post('/v1/audit/:id/resolve', async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = z
    .object({
      decision: z.enum(['APPROVED', 'BLOCKED']),
      resolvedBy: z.string().optional(),
      note: z.string().optional(),
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
  return result
})

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
}, async (req) => {
  const body = z
    .object({
      actor: z.string(),
      action: z.string(),
      context: z.record(z.unknown()).default({}),
      offlineMode: z.boolean().optional(),
      correlationId: z.string().optional(),
    })
    .parse(req.body)

  const request = ActionRequestSchema.parse({
    actor: body.actor,
    action: body.action,
    context: body.context,
  })

  const orgId =
    typeof body.context?.org_id === 'string' ? body.context.org_id : undefined

  const result = await traced(
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

  recordUsage(supabaseAuth, orgId, UsageMetrics.ACTION_VERIFY, 1, {
    action: body.action,
    decision: result.decision,
  })

  // Notify on anomaly spikes (BLOCKED or anomaly flags present)
  if (supabaseAuth && orgId && (result.decision === 'BLOCKED' || result.anomalyFlags.length > 0)) {
    const entEngine = getEntitlementEngine(supabaseAuth)
    void entEngine.getNotificationPrefs(orgId).then((prefs) => {
      sendNotificationDeduped(
        {
          type: 'anomaly.spike',
          orgId,
          title: `Anomaly detected: ${body.action}`,
          body: `Actor "${body.actor}" triggered ${result.anomalyFlags.join(', ') || 'a block'} on action "${body.action}". Decision: ${result.decision}. Risk: ${(result.risk * 100).toFixed(0)}%.`,
          severity: result.decision === 'BLOCKED' ? 'critical' : 'warning',
          data: { action: body.action, actor: body.actor, decision: result.decision, risk: result.risk, anomalyFlags: result.anomalyFlags },
        },
        { email: prefs.email, slackWebhookUrl: prefs.slackWebhookUrl, notificationWebhookUrl: prefs.notificationWebhookUrl },
        300_000, // 5-minute cooldown per org to avoid spam
      )
    }).catch(() => { /* best-effort */ })
  }

  return result
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

  const result = await runtime.verifyAction({
    actor: body.actor,
    action: body.action,
    context,
  })

  return {
    risk: result.risk,
    reason: result.reasoning,
    recommendation:
      result.decision === 'APPROVED'
        ? 'approve'
        : result.decision === 'BLOCKED'
          ? 'block'
          : 'require_verification',
    decision: result.decision,
    anomalyFlags: result.anomalyFlags,
    offlineMode: result.offlineMode,
  }
})

// Prometheus-format metrics (no auth — safe for scraping)
app.get('/metrics', async (_req, reply) => {
  const status = await runtime.getStatus()
  const policies = runtime.getPolicyEngine().getPolicies()
  const policyCount = Object.keys(policies).length
  const lines = [
    '# HELP sanctum_audit_entries_total Total audit entries in memory',
    '# TYPE sanctum_audit_entries_total gauge',
    `sanctum_audit_entries_total ${status.auditCount}`,
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
  ]
  return reply.type('text/plain; version=0.0.4; charset=utf-8').send(lines.join('\n') + '\n')
})

try {
  await app.listen({ port, host })
  console.log(`Sanctum API listening on http://${host}:${port}`)
  if (supabaseAuth) console.log('Supabase JWT auth enabled')
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.log('Supabase data sync enabled (audit_events, runtime_policies, webhook_deliveries)')
  }
  if (apiKey) console.log('Legacy API key auth enabled (SANCTUM_API_KEY env)')
  if (supabaseAuth) {
    const pepper = process.env.SANCTUM_API_KEY_PEPPER?.trim()
    if (pepper && pepper.length >= 16) {
      console.log('Dashboard API keys: bcrypt + SANCTUM_API_KEY_PEPPER')
    } else if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      console.log('Dashboard API keys: bcrypt + pepper derived from SUPABASE_SERVICE_ROLE_KEY')
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('WARN: Set SANCTUM_API_KEY_PEPPER or SUPABASE_SERVICE_ROLE_KEY for sk_sanctum_* keys')
    } else {
      console.log('Dashboard API keys: dev pepper')
    }

    // Warn if SANCTUM_API_KEY_PEPPER is not set in production
    if (!process.env.SANCTUM_API_KEY_PEPPER?.trim() && process.env.NODE_ENV === 'production') {
      console.warn('WARN: SANCTUM_API_KEY_PEPPER is not set. API key security relies on SUPABASE_SERVICE_ROLE_KEY pepper only.')
    }

    if (stopWebhookWorker) {
      console.log('Webhook delivery worker started (30s interval)')
    }
  }
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Graceful shutdown: stop webhook worker and close server
const shutdown = async (signal: string) => {
  console.log(`Received ${signal} — shutting down`)
  stopWebhookWorker?.()
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
