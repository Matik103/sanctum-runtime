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
import { registerAlertRoutes } from './alert-routes.js'
import { registerPushRoutes } from './push-routes.js'
import { AlertStore } from './alert-store.js'
import { sendVerificationEmail, verifyToken } from './verify-email.js'
import { loadPoliciesFromSupabase, detectAnomalies, heuristicRiskFloor } from '@sanctum/runtime-engine'
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
  if (path === '/health' || path === '/v1/billing/webhook' || path === '/v1/verify-action') return true
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
  await registerAlertRoutes(app)
  await registerPushRoutes(app)
  await registerAgentTokenRoutes(app, supabaseAuth)
}

const stopWebhookWorker = supabaseAuth ? startWebhookWorker(supabaseAuth) : null

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
    return { ok: true }
  }

  const status = await runtime.getStatus()
  const webhookStatus = runtime.getWebhookStatus()

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
  await admin.from('organizations').upsert(
    { id: personalOrgId, name: user.email ?? personalOrgId },
    { onConflict: 'id', ignoreDuplicates: true },
  ).catch(() => {})
  await admin.from('organization_members').upsert(
    { org_id: personalOrgId, user_id: user.id, role: 'owner' },
    { onConflict: 'org_id,user_id', ignoreDuplicates: true },
  ).catch(() => {})

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
})

const policyActionSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9_.:@/-]+$/)

// Simulate what would happen for a given action — no audit log entry created
app.post('/v1/policies/simulate', async (req) => {
  const body = z
    .object({
      actor: z.string().min(1),
      action: z.string().min(1),
      context: z.record(z.unknown()).default({}),
    })
    .parse(req.body)
  const request = ActionRequestSchema.parse(body)
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
    simulation: true,
    decision,
    risk,
    policyPath: policyEval.policyPath,
    anomalyFlags,
    conditionMatched: policyEval.policyPath.includes('.condition['),
    policyFlags: {
      autoBlock: policyEval.policy.autoBlock,
      requiresVerification: policyEval.policy.requiresVerification,
      blockWhenOffline: policyEval.policy.blockWhenOffline,
      allowedActors: policyEval.policy.allowedActors ?? [],
      conditions: policyEval.policy.conditions ?? [],
    },
  }
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

app.post('/v1/audit/:id/resolve', async (req, reply) => {
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

  // Out-of-band email verification — send approve/deny links when dashboard may be closed
  if (result.decision === 'REQUIRE_VERIFICATION' && supabaseAuth && orgId) {
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
  }

  return result
})

// One-time email approve/deny link (no auth — HMAC token is the proof)
app.get('/v1/verify-action', async (req, reply) => {
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
