import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { actorLabel, diffFields, logAdminAuditEvent } from './audit-admin-events.js'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { assertOrgRole, checkOrgRole } from './rbac.js'
import { isProduction } from './security.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

const companySizeSchema = z.enum(['1-10', '11-50', '51-200', '201-1000', '1001+'])
const industrySchema = z.enum([
  'software',
  'robotics',
  'manufacturing',
  'healthcare',
  'financial',
  'defense',
  'logistics',
  'energy',
  'professional',
  'other',
])

const countrySchema = z
  .string()
  .trim()
  .length(2)
  .transform((c) => c.toUpperCase())

function normalizeWebsiteHost(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withScheme)
    if (!url.hostname?.includes('.')) return null
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isPersonalWorkspaceOrgId(orgId: string): boolean {
  return orgId.startsWith('personal-')
}

export function isAccountProfileComplete(profile: {
  display_name: string | null
  country_code: string | null
  accepted_terms_at: string | null
}): { complete: boolean; missing: string[] } {
  const missing: string[] = []
  if (!profile.display_name?.trim() || profile.display_name.trim().length < 2) {
    missing.push('display_name')
  }
  if (!profile.country_code?.trim()) missing.push('country_code')
  if (!profile.accepted_terms_at) missing.push('accepted_terms')
  return { complete: missing.length === 0, missing }
}

async function primaryOrgIdForUser(
  store: ControlPlaneStore,
  userId: string,
): Promise<string | null> {
  const orgs = await store.getUserOrgIds(userId)
  return orgs[0] ?? null
}

export async function registerOrgProfileRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)

  async function resolveOrgId(req: SanctumReq, orgIdParam: string): Promise<string | null> {
    if (req.sanctumUser) {
      const orgs = await store.getUserOrgIds(req.sanctumUser.id)
      return orgs.includes(orgIdParam) ? orgIdParam : null
    }
    return null
  }

  app.get('/v1/account/profile', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('profiles')
      .select(
        'id, email, display_name, job_title, country_code, portal_type, auth_provider, accepted_terms_at, terms_version, created_at, updated_at',
      )
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      return reply.status(500).send({
        error: 'profile_load_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }
    if (!data) return reply.status(404).send({ error: 'profile_not_found' })
    const completion = isAccountProfileComplete(data)
    return { ...data, ...completion }
  })

  app.patch('/v1/account/profile', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const body = z
      .object({
        display_name: z.string().trim().min(2).max(120).optional(),
        job_title: z.string().trim().min(2).max(80).nullable().optional(),
        country_code: countrySchema.optional(),
        accept_terms: z.boolean().optional(),
      })
      .parse(req.body)

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (body.display_name !== undefined) patch.display_name = body.display_name
    if (body.job_title !== undefined) patch.job_title = body.job_title
    if (body.country_code !== undefined) patch.country_code = body.country_code
    if (body.accept_terms) {
      patch.accepted_terms_at = new Date().toISOString()
      patch.terms_version = '2025-05'
    }

    const admin = createSupabaseAdmin(cfg)
    const { data: before } = await admin
      .from('profiles')
      .select('display_name, job_title, country_code, accepted_terms_at')
      .eq('id', user.id)
      .maybeSingle()

    const { data, error } = await admin
      .from('profiles')
      .update(patch)
      .eq('id', user.id)
      .select(
        'id, email, display_name, job_title, country_code, portal_type, auth_provider, accepted_terms_at, terms_version, created_at, updated_at',
      )
      .single()

    if (error) {
      return reply.status(500).send({
        error: 'profile_update_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }

    const changes = before
      ? diffFields(before, data, ['display_name', 'job_title', 'country_code'])
      : undefined
    if (changes) {
      logAdminAuditEvent(cfg, {
        orgId: await primaryOrgIdForUser(store, user.id),
        actor: actorLabel(req as SanctumReq),
        action: 'account.profile.updated',
        reasoning: 'Account holder updated profile fields in Settings.',
        changes,
      })
    }

    return { ...data, ...isAccountProfileComplete(data) }
  })

  app.get('/v1/orgs/:orgId/profile', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const resolved = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolved) return reply.status(403).send({ error: 'org_forbidden' })

    const role = await checkOrgRole(cfg, orgId, user.id)
    if (!role) return reply.status(403).send({ error: 'org_forbidden' })

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('organizations')
      .select(
        'id, name, legal_name, website, country_code, company_size, industry, primary_contact_name, primary_contact_email, primary_contact_title, signup_source, created_at, updated_at',
      )
      .eq('id', orgId)
      .maybeSingle()

    if (error) {
      return reply.status(500).send({
        error: 'org_profile_load_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }
    if (!data) return reply.status(404).send({ error: 'org_not_found' })

    return {
      ...data,
      is_personal_workspace: isPersonalWorkspaceOrgId(orgId),
      caller_role: role,
    }
  })

  app.patch('/v1/orgs/:orgId/profile', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    const resolved = await resolveOrgId(req as SanctumReq, orgId)
    if (!resolved) return reply.status(403).send({ error: 'org_forbidden' })

    try {
      await assertOrgRole(cfg, orgId, user.id, 'admin')
    } catch {
      return reply.status(403).send({ error: 'insufficient_role', required: 'admin' })
    }

    const personal = isPersonalWorkspaceOrgId(orgId)

    if (personal) {
      const body = z
        .object({
          workspace_name: z.string().trim().min(2).max(120),
        })
        .parse(req.body)

      const admin = createSupabaseAdmin(cfg)
      const { data: before } = await admin
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .maybeSingle()

      const { data, error } = await admin
        .from('organizations')
        .update({ name: body.workspace_name, updated_at: new Date().toISOString() })
        .eq('id', orgId)
        .select('id, name, created_at, updated_at')
        .single()

      if (error) {
        return reply.status(500).send({
          error: 'org_profile_update_failed',
          ...(!isProduction() && { detail: error.message }),
        })
      }

      const changes = before ? diffFields(before, data, ['name']) : undefined
      if (changes) {
        logAdminAuditEvent(cfg, {
          orgId,
          actor: actorLabel(req as SanctumReq),
          action: 'organization.profile.updated',
          reasoning: 'Workspace display name updated.',
          changes,
        })
      }

      return {
        ...data,
        is_personal_workspace: true,
        caller_role: await checkOrgRole(cfg, orgId, user.id),
      }
    }

    const body = z
      .object({
        legal_name: z.string().trim().min(2).max(160).optional(),
        website: z.string().trim().min(3).max(200).optional(),
        country_code: countrySchema.optional(),
        company_size: companySizeSchema.optional(),
        industry: industrySchema.optional(),
        primary_contact_name: z.string().trim().min(2).max(120).optional(),
        primary_contact_email: z.email().optional(),
        primary_contact_title: z.string().trim().min(2).max(80).optional(),
      })
      .parse(req.body)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.legal_name !== undefined) {
      patch.legal_name = body.legal_name
      patch.name = body.legal_name
    }
    if (body.website !== undefined) {
      const host = normalizeWebsiteHost(body.website)
      if (!host) return reply.status(400).send({ error: 'invalid_website' })
      patch.website = host
    }
    if (body.country_code !== undefined) patch.country_code = body.country_code
    if (body.company_size !== undefined) patch.company_size = body.company_size
    if (body.industry !== undefined) patch.industry = body.industry
    if (body.primary_contact_name !== undefined) patch.primary_contact_name = body.primary_contact_name
    if (body.primary_contact_email !== undefined) patch.primary_contact_email = body.primary_contact_email
    if (body.primary_contact_title !== undefined) patch.primary_contact_title = body.primary_contact_title

    const admin = createSupabaseAdmin(cfg)
    const { data: before } = await admin
      .from('organizations')
      .select(
        'name, legal_name, website, country_code, company_size, industry, primary_contact_name, primary_contact_email, primary_contact_title',
      )
      .eq('id', orgId)
      .maybeSingle()

    const { data, error } = await admin
      .from('organizations')
      .update(patch)
      .eq('id', orgId)
      .select(
        'id, name, legal_name, website, country_code, company_size, industry, primary_contact_name, primary_contact_email, primary_contact_title, signup_source, created_at, updated_at',
      )
      .single()

    if (error) {
      return reply.status(500).send({
        error: 'org_profile_update_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }

    const changeKeys = Object.keys(patch).filter((k) => k !== 'updated_at') as (keyof typeof before)[]
    const changes = before ? diffFields(before, data, changeKeys) : undefined
    if (changes) {
      logAdminAuditEvent(cfg, {
        orgId,
        actor: actorLabel(req as SanctumReq),
        action: 'organization.profile.updated',
        reasoning: 'Organization vendor/compliance profile updated in Settings.',
        changes,
      })
    }

    return {
      ...data,
      is_personal_workspace: false,
      caller_role: await checkOrgRole(cfg, orgId, user.id),
    }
  })
}
