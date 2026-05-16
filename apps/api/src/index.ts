import cors from '@fastify/cors'
import { RuntimeEngine } from '@sanctum/runtime-engine'
import { ActionRequestSchema } from '@sanctum-runtime/sdk'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { z } from 'zod'
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

const runtime = new RuntimeEngine({
  forceOfflineMode: forceOffline,
})

const app = Fastify({ logger: true })

const corsOrigins = new Set([
  dashboardUrl,
  'http://127.0.0.1:5174',
  'http://localhost:5174',
])

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    cb(null, corsOrigins.has(origin))
  },
})

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: 'validation_error',
      details: err.flatten(),
    })
  }
  app.log.error(err)
  return reply.status(500).send({ error: 'internal_error' })
})

app.addHook('onRequest', async (req, reply) => {
  if (!apiKey) return
  if (req.url === '/health' || req.url === '/') return
  const key = req.headers['x-sanctum-key']
  if (key !== apiKey) {
    return reply.status(401).send({ error: 'unauthorized' })
  }
})

await runtime.init()

app.get('/', async () => ({
  name: 'Sanctum Runtime API',
  version: '0.1.0',
  docs: 'See DEVELOPMENT.md in the repo',
  dashboard: dashboardUrl,
  auth: apiKey ? 'X-Sanctum-Key required' : 'none (local dev)',
  endpoints: {
    health: 'GET /health',
    status: 'GET /v1/status',
    verify: 'POST /v1/actions/verify',
    audit: 'GET /v1/audit',
    resolve: 'POST /v1/audit/:id/resolve',
    policies: 'GET /v1/policies',
    analyze: 'POST /analyze-action',
  },
}))

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

app.patch('/v1/policies/:action', async (req) => {
  const action = (req.params as { action: string }).action
  const body = z
    .object({
      requiresVerification: z.boolean().optional(),
      autoBlock: z.boolean().optional(),
      blockWhenOffline: z.boolean().optional(),
    })
    .parse(req.body)
  return await runtime.getPolicyEngine().updatePolicy(action, body)
})

app.get('/v1/audit', async (req) => {
  const limit = Number((req.query as { limit?: string }).limit ?? 50)
  return runtime.getAuditStore().list(limit)
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
  if (apiKey) console.log('API key auth enabled (X-Sanctum-Key)')
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
