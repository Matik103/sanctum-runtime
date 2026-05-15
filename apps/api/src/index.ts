import cors from '@fastify/cors'
import { RuntimeEngine } from '@sanctum/runtime-engine'
import { ActionRequestSchema } from '@sanctum/runtime'
import Fastify from 'fastify'
import { z } from 'zod'

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'
const forceOffline = process.env.SANCTUM_OFFLINE_MODE === 'true'

const runtime = new RuntimeEngine({
  forceOfflineMode: forceOffline,
})

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
})

await runtime.init()

app.get('/', async () => ({
  name: 'Sanctum Runtime API',
  version: '0.1.0',
  docs: 'See DEVELOPMENT.md in the repo',
  dashboard: 'http://localhost:5174',
  endpoints: {
    health: 'GET /health',
    status: 'GET /v1/status',
    verify: 'POST /v1/actions/verify',
    audit: 'GET /v1/audit',
    policies: 'GET /v1/policies',
    analyze: 'POST /analyze-action',
  },
}))

app.get('/health', async () => ({ ok: true }))

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
      actor: z.string().default('local-agent'),
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
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
