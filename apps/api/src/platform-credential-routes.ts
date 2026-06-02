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

function canRevealPlatformSecretForDevE2E(): boolean {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.SANCTUM_ENV === 'production'
  return !isProduction && process.env.SANCTUM_ALLOW_CREDENTIAL_REVEAL === 'true'
}

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
        include_secret: z.boolean().optional(),
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

    const response: Record<string, unknown> = {
      ok: result.ok,
      platform,
      status: result.status,
      detail: result.detail,
    }
    if (body.include_secret) {
      if (!canRevealPlatformSecretForDevE2E()) {
        return reply.status(403).send({
          error: 'credential_reveal_disabled',
          hint: 'Set TEST_PLATFORM_KEY for E2E runs; saved platform secrets are not revealed by this environment.',
        })
      }
      try {
        await assertOrgRole(cfg, orgId, user.id, 'admin')
        response.secret = secret
      } catch {
        return reply.status(403).send({ error: 'org_admin_required' })
      }
    }

    return response
  })

  /** Dev-only E2E helper. Disabled in production even for org admins. */
  app.get('/v1/orgs/:orgId/platform-credentials/:platform/bootstrap-secret', async (req, reply) => {
    if (!canRevealPlatformSecretForDevE2E()) {
      return reply.status(404).send({ error: 'not_found' })
    }

    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })

    const { orgId, platform } = req.params as { orgId: string; platform: string }
    platformParam.parse(platform)
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    try {
      await assertOrgRole(cfg, orgId, user.id, 'admin')
    } catch {
      return reply.status(403).send({ error: 'org_admin_required' })
    }

    const q = req.query as { environment?: string }
    const environment = q.environment ?? 'production'
    const secret = await getPlatformSecret(cfg, orgId, platform, environment)
    if (!secret) {
      return reply.status(404).send({ error: 'not_configured' })
    }

    const { createSupabaseAdmin } = await import('./auth.js')
    const admin = createSupabaseAdmin(cfg)
    void admin.from('audit_events').insert({
      org_id: orgId,
      actor: user.email ?? user.id,
      action: 'platform_credential.bootstrap_reveal',
      decision: 'APPROVED',
      risk: 'medium',
      reasoning: 'Platform credential revealed for E2E bootstrap sync.',
      context: { platform, environment },
    })

    return { platform, environment, secret }
  })
}
