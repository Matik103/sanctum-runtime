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
import { startWebhookWorker } from './webhook-queue.js'
import { riskModelBreaker } from './circuit-breaker.js'
import { traced } from './telemetry.js'
import { sendNotificationDeduped } from './notifications.js'
import { getEntitlementEngine } from './entitlements.js'
import { recordUsage, UsageMetrics } from './usage-store.js'
import { registerRuntimeWsRoutes } from './runtime-ws-routes.js'
import { runtimeWsHub } from './runtime-ws-hub.js'
import { registerAlertRoutes } from './alert-routes.js'
import { AlertStore } from './alert-store.js'
import { initVapid, registerPushRoutes, sendPushToOrg } from './web-push.js'
import {
  authenticateRequest,
  getSupabaseAuthConfig,
  isSupabaseAuthEnabled,
} from './auth.js'
import {
  loadRepoEnv,
  resolveApiListenTarget,
  resolveDashboardUrl,
} from '../../../scripts/env.ts'

loadRepoEnv()
initVapid()
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
    if (!origin) return cb(null, true)
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
  const detail = err instanceof Error ? err.message : undefined
  return reply.status(500).send({
    error: 'internal_error',
    ...(detail && { detail }),
  })
})

const AUTH_BYPASS = new Set(['/health', '/', '/metrics', '/v1/billing/webhook', '/v1/status'])

app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'OPTIONS') return

  const path = req.url.split('?')[0]
  if (AUTH_BYPASS.has(path)) return

  const auth = await authenticateRequest(req.headers, {
    supabase: supabaseAuth,
    apiKey,
  })

  if (!auth.ok) {
    return reply.status(401).send({
      error: 'unauthorized',
      hint: isSupabaseAuthEnabled()
        ? 'Sign in via the dashboard (Bearer JWT) or send X-Sanctum-Key for scripts'
        : 'Set X-Sanctum-Key or configure Supabase auth',
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

app.get('/', async () => ({
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
      'POST /v1/runtimes/connect · POST …/attest · GET …/trust · heartbeat/agents/events',
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
}))

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
  await registerAlertRoutes(app)
  registerPushRoutes(app, supabaseAuth, async (req) => {
    const b = req.body as { org_id?: string; context?: { org_id?: string } } | undefined
    return (b?.org_id ?? (b?.context?.org_id as string | undefined)) ?? null
  })
}

const stopWebhookWorker = supabaseAuth ? startWebhookWorker(supabaseAuth) : null

app.get('/health', async () => {
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
      endpoint: status.riskEndpoint ?? null,
    },
    audit: {
      count: status.auditCount,
      supabaseConfigured: status.supabaseConfigured,
    },
    policies: {
      count: status.policyCount,
    },
    supabase: supabaseOk,
    webhooks: {
      configured: webhookStatus.configured,
      urlCount: webhookStatus.urlCount,
    },
    wsConnections: runtimeWsHub.connectedCount(),
  }
})

app.get('/v1/status', async () => runtime.getStatus())

app.get('/v1/policies', async () => runtime.getPolicyEngine().getPolicies())

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

app.post('/v1/policies', async (req) => {
  const body = z
    .object({
      action: policyActionSchema,
    })
    .merge(policyPatchSchema)
    .parse(req.body)
  const { action, ...patch } = body
  return runtime.getPolicyEngine().createPolicy(action, patch)
})

app.patch('/v1/policies/:action', async (req) => {
  const action = policyActionSchema.parse((req.params as { action: string }).action)
  const body = policyPatchSchema.parse(req.body)
  return await runtime.getPolicyEngine().updatePolicy(action, body)
})

app.delete('/v1/policies/:action', async (req) => {
  const action = policyActionSchema.parse((req.params as { action: string }).action)
  return runtime.getPolicyEngine().deletePolicy(action)
})

app.get('/v1/policies/export.yaml', async (_req, reply) => {
  return reply.type('text/yaml; charset=utf-8').send(runtime.exportPoliciesYaml())
})

app.post('/v1/policies/import.yaml', async (req) => {
  const body = z
    .object({
      yaml: z.string().min(1),
      merge: z.boolean().optional().default(true),
    })
    .parse(req.body)
  return runtime.importPoliciesYaml(body.yaml, body.merge)
})

app.get('/v1/webhooks/status', async () => runtime.getWebhookStatus())

app.get('/v1/audit', async (req) => {
  const q = req.query as { limit?: string; org_id?: string }
  const limit = Math.min(500, Math.max(1, Number(q.limit ?? 50) || 50))
  const orgId = q.org_id
  return runtime.listAudit(limit, orgId)
})

app.get('/v1/verifications/:correlationId', async (req) => {
  const { correlationId } = req.params as { correlationId: string }
  return runtime.getVerificationStatus(correlationId)
})

app.get('/v1/orgs/:orgId/policies', async (req) => {
  const { orgId } = req.params as { orgId: string }
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

  // Enforce org scope when Supabase auth is active.
  if (supabaseAuth) {
    const entry = runtime.getAuditStore().getById(id)
    const entryOrgId =
      entry && typeof entry.context?.org_id === 'string'
        ? entry.context.org_id
        : undefined
    if (entryOrgId) {
      const { ControlPlaneStore } = await import('./control-plane-store.js')
      const store = new ControlPlaneStore(supabaseAuth)
      const user = (req as { sanctumUser?: { id: string } }).sanctumUser
      let allowedOrgs: string[] | null = null
      if (user) {
        allowedOrgs = await store.getUserOrgIds(user.id)
      } else {
        const key = Array.isArray(req.headers['x-sanctum-key'])
          ? req.headers['x-sanctum-key'][0]
          : req.headers['x-sanctum-key']
        if (key?.startsWith('sk_sanctum_')) {
          const orgId = await store.getApiKeyOrgId(key)
          allowedOrgs = orgId ? [orgId] : []
        }
      }
      if (allowedOrgs !== null && !allowedOrgs.includes(entryOrgId)) {
        return reply.status(403).send({ error: 'org_forbidden' })
      }
    }
  }

  const result = await runtime.resolveAuditEntry(id, body)
  if (!result) {
    return reply.status(404).send({ error: 'audit_entry_not_found' })
  }
  return result
})

app.post('/v1/actions/verify', async (req) => {
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


  // Push notification when agent requires verification and dashboard may be closed
  if (result.decision === 'REQUIRE_VERIFICATION' && supabaseAuth && orgId) {
    void sendPushToOrg(supabaseAuth, orgId, {
      title: 'Verification Required',
      body: `${body.actor} wants to ${body.action} — tap to review`,
      tag: `verify-${result.id}`,
      url: `/?page=activity`,
      data: { entryId: result.id, action: body.action, actor: body.actor, risk: result.risk },
    }).catch(() => {})
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
