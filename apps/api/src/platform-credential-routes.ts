import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { SupabaseAuthConfig } from './auth.js'
import { assertOrgRole } from './rbac.js'
import {
  deletePlatformCredential,
  getPlatformSecret,
  isSupportedPlatform,
  listPlatformCredentials,
  recordPlatformTestResult,
  testPlatformSecret,
  upsertPlatformCredential,
} from './platform-credentials.js'

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

const platformParam = z.enum(['openai', 'deepseek', 'qwen', 'kimi', 'doubao', 'gemini'])

async function requireRole(
  cfg: SupabaseAuthConfig,
  orgId: string,
  userId: string,
  role: 'viewer' | 'member',
  reply: import('fastify').FastifyReply,
): Promise<boolean> {
  try {
    await assertOrgRole(cfg, orgId, userId, role)
    return true
  } catch {
    reply.status(403).send({ error: 'insufficient_role' })
    return false
  }
}

export async function registerPlatformCredentialRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  app.get('/v1/orgs/:orgId/platform-credentials', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })

    const { orgId } = req.params as { orgId: string }
    const { environment } = z.object({ environment: z.string().optional() }).parse(req.query ?? {})
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return

    try {
      const credentials = await listPlatformCredentials(cfg, orgId, environment)
      return { credentials }
    } catch (err) {
      req.log.error({ err }, 'platform_credentials_list_failed')
      return reply.status(500).send({ error: 'platform_credentials_list_failed' })
    }
  })

  app.put('/v1/orgs/:orgId/platform-credentials/:platform', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })

    const { orgId, platform } = req.params as { orgId: string; platform: string }
    if (!isSupportedPlatform(platform)) {
      return reply.status(400).send({ error: 'unsupported_platform' })
    }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const body = z
      .object({
        secret: z.string().min(8).max(512),
        default_agent_id: z.string().uuid().nullable().optional(),
        environment: z.enum(['development', 'staging', 'production']).optional(),
      })
      .parse(req.body)

    try {
      return await upsertPlatformCredential(cfg, {
        orgId,
        platform,
        secret: body.secret,
        userId: user.id,
        defaultAgentId: body.default_agent_id,
        environment: body.environment,
      })
    } catch (err) {
      req.log.error({ err, orgId, platform }, 'platform_credentials_save_failed')
      return reply.status(500).send({ error: 'platform_credentials_save_failed' })
    }
  })

  app.delete('/v1/orgs/:orgId/platform-credentials/:platform', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })

    const { orgId, platform } = req.params as { orgId: string; platform: string }
    platformParam.parse(platform)
    const { environment } = z.object({ environment: z.string().optional() }).parse(req.query ?? {})
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    try {
      await deletePlatformCredential(cfg, orgId, platform, environment ?? 'production')
      return { ok: true }
    } catch (err) {
      req.log.error({ err, orgId, platform }, 'platform_credentials_delete_failed')
      return reply.status(500).send({ error: 'platform_credentials_delete_failed' })
    }
  })

  app.post('/v1/orgs/:orgId/platform-credentials/:platform/test', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })

    const { orgId, platform } = req.params as { orgId: string; platform: string }
    platformParam.parse(platform)
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const body = z
      .object({
        secret: z.string().min(8).max(512).optional(),
        environment: z.enum(['development', 'staging', 'production']).optional(),
      })
      .parse(req.body ?? {})

    const environment = body.environment ?? 'production'
    let secret = body.secret?.trim()
    if (!secret) {
      secret = (await getPlatformSecret(cfg, orgId, platform, environment)) ?? undefined
    }
    if (!secret) {
      return reply.status(400).send({
        error: 'secret_required',
        hint: 'Provide secret in body or save a key first.',
      })
    }

    const result = await testPlatformSecret(platform, secret)
    if (!body.secret) {
      await recordPlatformTestResult(cfg, orgId, platform, result, environment).catch(() => {})
    }

    return {
      ok: result.ok,
      platform,
      status: result.status,
      detail: result.detail,
    }
  })
}
