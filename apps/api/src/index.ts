import cors from '@fastify/cors'
import { RuntimeEngine } from '@sanctum/runtime-engine'
import { ActionRequestSchema } from '@sanctum-runtime/sdk'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { z } from 'zod'
import { registerApiKeyRoutes } from './api-keys.js'
import { registerControlPlaneRoutes } from './control-plane-routes.js'
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
const { host, port } = resolveApiListenTarget()
const dashboardUrl = resolveDashboardUrl()
const forceOffline = process.env.SANCTUM_OFFLINE_MODE === 'true'
const apiKey = process.env.SANCTUM_API_KEY?.trim() || undefined
const supabaseAuth = getSupabaseAuthConfig()

const runtime = new RuntimeEngine({
  forceOfflineMode: forceOffline,
})

const app = Fastify({ logger: true })

const corsOrigins = new Set([
  dashboardUrl,
  'https://sanctum-dashboard.onrender.com',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
])

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    cb(null, corsOrigins.has(origin))
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sanctum-Key'],
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

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0]
  if (path === '/health' || path === '/') return

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

app.get('/', async () => ({
  name: 'Sanctum Runtime API',
  version: '0.1.0',
  docs: 'See DEVELOPMENT.md in the repo',
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
    runtimes: 'POST /v1/runtimes/connect · GET /v1/runtimes · heartbeat/agents/events',
    operatorContext: 'GET /v1/operator/context',
    eventStream: 'GET /v1/events/stream (SSE)',
    analyze: 'POST /analyze-action',
  },
}))

if (supabaseAuth) {
  await registerApiKeyRoutes(app, supabaseAuth)
  await registerControlPlaneRoutes(app)
}

app.get('/health', async () => {
  const status = await runtime.getStatus()
  return {
    ok: status.runtimeOnline,
    ollama: status.ollamaConnected,
    auditCount: status.auditCount,
    policyCount: status.policyCount,
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
  const limit = Number((req.query as { limit?: string }).limit ?? 50)
  const orgId = (req.query as { org_id?: string }).org_id
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

  return runtime.verifyAction(request, {
    offlineMode: body.offlineMode,
    correlationId: body.correlationId,
  })
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
  }
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
