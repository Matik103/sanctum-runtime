import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { RuntimeEngine } from '@sanctum/runtime-engine'
import { z } from 'zod'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import {
  applyMarketplacePolicyTemplates,
  policyKeysForUninstall,
  removeMarketplacePolicyTemplates,
} from './marketplace-policies.js'
import { MarketplaceStore } from './marketplace-store.js'
import { recordUsage, UsageMetrics } from './usage-store.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

async function resolveOrgScope(
  req: SanctumReq,
  store: ControlPlaneStore,
): Promise<string[] | null> {
  if (req.sanctumUser) return store.getUserOrgIds(req.sanctumUser.id)
  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) {
    const orgId = await store.getApiKeyOrgId(key)
    return orgId ? [orgId] : null
  }
  return null
}

function assertOrgAllowed(
  scope: string[] | null,
  orgId: string,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
) {
  if (scope === null) return true
  if (!scope.includes(orgId)) {
    reply.status(403).send({ error: 'org_forbidden' })
    return false
  }
  return true
}

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/)

export async function registerMarketplaceRoutes(
  app: FastifyInstance,
  runtime: RuntimeEngine,
) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const market = new MarketplaceStore(cfg)

  app.get('/v1/marketplace/packages', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    if (orgId) {
      const scope = await resolveOrgScope(req as SanctumReq, store)
      if (!assertOrgAllowed(scope, orgId, reply)) return
    }
    const packages = await market.listPackages(orgId)
    return { packages }
  })

  app.get('/v1/marketplace/packages/:slug', async (req, reply) => {
    const slug = slugSchema.parse((req.params as { slug: string }).slug)
    const orgId = (req.query as { org_id?: string }).org_id
    if (orgId) {
      const scope = await resolveOrgScope(req as SanctumReq, store)
      if (!assertOrgAllowed(scope, orgId, reply)) return
    }
    const pkg = await market.getBySlug(slug, orgId)
    if (!pkg) return reply.status(404).send({ error: 'package_not_found' })
    return { package: pkg }
  })

  app.post('/v1/marketplace/packages', async (req, reply) => {
    const body = z
      .object({
        organizationId: z.string().min(1).max(64),
        slug: slugSchema,
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        category: z.string().max(64).optional(),
        connectDefaults: z.record(z.unknown()).optional(),
        policyTemplates: z.array(z.record(z.unknown())).optional(),
        readme: z.string().max(8000).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return
    await store.ensureOrg(body.organizationId)

    try {
      const pkg = await market.createPackage({
        orgId: body.organizationId,
        slug: body.slug,
        name: body.name,
        description: body.description,
        category: body.category,
        connectDefaults: body.connectDefaults,
        policyTemplates: body.policyTemplates,
        readme: body.readme,
      })
      return { package: pkg }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create_failed'
      if (msg.includes('duplicate') || msg.includes('unique')) {
        return reply.status(409).send({ error: 'slug_exists' })
      }
      throw e
    }
  })

  app.post('/v1/marketplace/packages/:slug/install', async (req, reply) => {
    const slug = slugSchema.parse((req.params as { slug: string }).slug)
    const body = z
      .object({
        organizationId: z.string().min(1).max(64),
        config: z.record(z.unknown()).optional(),
      })
      .parse(req.body)

    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, body.organizationId, reply)) return
    await store.ensureOrg(body.organizationId)

    try {
      const catalog = await market.getBySlug(slug, body.organizationId)
      if (!catalog) return reply.status(404).send({ error: 'package_not_found' })

      const appliedPolicyKeys = await applyMarketplacePolicyTemplates(
        runtime,
        body.organizationId,
        catalog.policy_templates,
      )

      const { install, package: pkg } = await market.install(
        body.organizationId,
        slug,
        {
          ...(body.config ?? {}),
          appliedPolicyKeys,
          packageSlug: slug,
          packageVersion: catalog.version,
        },
      )
      await store.insertEvent({
        orgId: body.organizationId,
        eventType: 'marketplace.installed',
        payload: { slug, version: pkg.version },
      })
      recordUsage(cfg, body.organizationId, UsageMetrics.MARKETPLACE_INSTALL, 1, {
        slug,
        version: pkg.version,
      })
      const connect = market.connectHints(pkg, {
        ...((install.config as Record<string, unknown>) ?? {}),
      })
      connect.organizationId = body.organizationId
      return {
        installId: install.id,
        installedAt: install.installed_at,
        connect,
        appliedPolicyKeys,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'install_failed'
      if (msg === 'package_not_found') return reply.status(404).send({ error: msg })
      throw e
    }
  })

  app.delete('/v1/marketplace/packages/:slug/install', async (req, reply) => {
    const slug = slugSchema.parse((req.params as { slug: string }).slug)
    const orgId = (req.query as { org_id?: string }).org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const installRow = await market.getInstallRecord(orgId, slug)
    if (!installRow) return reply.status(404).send({ error: 'not_installed' })

    const policyKeys = policyKeysForUninstall(
      orgId,
      (installRow.install.config as Record<string, unknown> | undefined) ?? undefined,
      installRow.package.policy_templates,
    )

    await store.ensureOrg(orgId)

    try {
      await removeMarketplacePolicyTemplates(runtime, policyKeys)
    } catch (e) {
      req.log.warn({ err: e, slug, orgId }, 'marketplace policy cleanup failed')
    }

    const removed = await market.uninstall(orgId, slug)
    if (!removed) return reply.status(404).send({ error: 'not_installed' })

    try {
      await store.insertEvent({
        orgId,
        eventType: 'marketplace.uninstalled',
        payload: { slug, policyKeysRemoved: policyKeys.length },
      })
    } catch (e) {
      req.log.warn({ err: e, slug, orgId }, 'marketplace uninstalled event failed')
    }
    return { ok: true }
  })

  app.get('/v1/marketplace/packages/:slug/connect', async (req, reply) => {
    const slug = slugSchema.parse((req.params as { slug: string }).slug)
    const orgId = (req.query as { org_id?: string }).org_id
    if (!orgId) return reply.status(400).send({ error: 'org_id_required' })
    const scope = await resolveOrgScope(req as SanctumReq, store)
    if (!assertOrgAllowed(scope, orgId, reply)) return

    const connect = await market.getInstallConfig(orgId, slug)
    if (!connect) return reply.status(404).send({ error: 'package_not_installed' })
    connect.organizationId = orgId
    return { connect }
  })
}
