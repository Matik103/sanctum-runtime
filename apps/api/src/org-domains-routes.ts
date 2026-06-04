import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { actorLabel, logAdminAuditEvent } from './audit-admin-events.js'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine } from './entitlements.js'
import { hasPlanFeature, sendPlanFeatureRequired } from './entitlements-gate.js'
import { isPersonalWorkspaceOrgId } from './org-profile-routes.js'
import {
  dnsTxtHost,
  dnsTxtRecordValue,
  domainFingerprint,
  generateDomainVerificationToken,
  normalizeEmailDomain,
  verifyDomainDnsTxt,
} from './org-domains.js'
import { assertOrgRole } from './rbac.js'
import { isProduction } from './security.js'

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

const MAX_DOMAINS_PER_ORG = 20

export async function registerOrgDomainsRoutes(app: FastifyInstance): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  async function resolveOrgId(req: SanctumReq, orgId: string): Promise<string | null> {
    if (!req.sanctumUser) return null
    const orgs = await store.getUserOrgIds(req.sanctumUser.id)
    return orgs.includes(orgId) ? orgId : null
  }

  app.get('/v1/orgs/:orgId/domains', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    if (!(await resolveOrgId(req as SanctumReq, orgId))) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }
    if (isPersonalWorkspaceOrgId(orgId)) {
      return reply.status(400).send({ error: 'personal_workspace_no_domains' })
    }

    const limits = await entitlements.getLimits(orgId)
    if (!hasPlanFeature(limits, 'sso')) {
      return reply.status(403).send({
        error: 'plan_feature_required',
        feature: 'sso',
        message: 'Domain verification for Company SSO requires the Team plan or higher.',
        upgrade_plan: 'team',
      })
    }

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('organization_domains')
      .select(
        'domain, org_id, verified, verified_at, verification_method, created_at, updated_at, verification_token',
      )
      .eq('org_id', orgId)
      .order('domain')

    if (error) {
      return reply.status(500).send({
        error: 'domains_load_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }

    return {
      domains: (data ?? []).map((row) => ({
        domain: row.domain,
        verified: row.verified,
        verified_at: row.verified_at,
        verification_method: row.verification_method,
        created_at: row.created_at,
        updated_at: row.updated_at,
        dns_host: dnsTxtHost(row.domain as string),
        dns_txt_value: row.verification_token
          ? dnsTxtRecordValue(row.verification_token as string)
          : null,
      })),
    }
  })

  app.post('/v1/orgs/:orgId/domains', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    if (!(await resolveOrgId(req as SanctumReq, orgId))) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }
    if (isPersonalWorkspaceOrgId(orgId)) {
      return reply.status(400).send({ error: 'personal_workspace_no_domains' })
    }

    try {
      await assertOrgRole(cfg, orgId, user.id, 'admin')
    } catch {
      return reply.status(403).send({ error: 'insufficient_role', required: 'admin' })
    }

    const limits = await entitlements.getLimits(orgId)
    if (!hasPlanFeature(limits, 'sso')) {
      sendPlanFeatureRequired(
        reply,
        limits,
        'sso',
        'Verified email domains for Company SSO require the Team plan or higher.',
      )
      return
    }

    const body = z.object({ domain: z.string().trim().min(3).max(253) }).parse(req.body)
    const domain = normalizeEmailDomain(body.domain)
    if (!domain) {
      return reply.status(400).send({
        error: 'invalid_domain',
        message: 'Enter a valid work email domain (not a public mailbox provider).',
      })
    }

    const admin = createSupabaseAdmin(cfg)
    const { count } = await admin
      .from('organization_domains')
      .select('domain', { count: 'exact', head: true })
      .eq('org_id', orgId)

    if ((count ?? 0) >= MAX_DOMAINS_PER_ORG) {
      return reply.status(400).send({ error: 'domain_limit_reached', limit: MAX_DOMAINS_PER_ORG })
    }

    const token = generateDomainVerificationToken()
    const { data, error } = await admin
      .from('organization_domains')
      .insert({
        domain,
        org_id: orgId,
        verified: false,
        verification_token: token,
        verification_method: null,
        verified_at: null,
        created_by: user.id,
      })
      .select('domain, org_id, verified, verified_at, verification_method, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return reply.status(409).send({ error: 'domain_already_registered' })
      }
      return reply.status(500).send({
        error: 'domain_create_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }

    logAdminAuditEvent(cfg, {
      orgId,
      actor: actorLabel(req as SanctumReq),
      action: 'organization_domain.added',
      reasoning: `Work email domain ${domain} registered for Company SSO (pending DNS verification).`,
      context: { domain, domain_fingerprint: domainFingerprint(domain, orgId) },
    })

    return {
      ...data,
      dns_host: dnsTxtHost(domain),
      dns_txt_value: dnsTxtRecordValue(token),
    }
  })

  app.post('/v1/orgs/:orgId/domains/:domain/verify', async (req, reply) => {
    const { orgId, domain: domainParam } = req.params as { orgId: string; domain: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    if (!(await resolveOrgId(req as SanctumReq, orgId))) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }

    try {
      await assertOrgRole(cfg, orgId, user.id, 'admin')
    } catch {
      return reply.status(403).send({ error: 'insufficient_role', required: 'admin' })
    }

    const limits = await entitlements.getLimits(orgId)
    if (!hasPlanFeature(limits, 'sso')) {
      sendPlanFeatureRequired(reply, limits, 'sso')
      return
    }

    const domain = normalizeEmailDomain(decodeURIComponent(domainParam))
    if (!domain) return reply.status(400).send({ error: 'invalid_domain' })

    const admin = createSupabaseAdmin(cfg)
    const { data: row, error: loadErr } = await admin
      .from('organization_domains')
      .select('domain, org_id, verified, verification_token')
      .eq('org_id', orgId)
      .eq('domain', domain)
      .maybeSingle()

    if (loadErr || !row) return reply.status(404).send({ error: 'domain_not_found' })
    if (row.verified) {
      return { domain, verified: true, verified_at: new Date().toISOString(), already_verified: true }
    }
    if (!row.verification_token) {
      return reply.status(400).send({ error: 'verification_token_missing' })
    }

    const ok = await verifyDomainDnsTxt(domain, row.verification_token as string)
    if (!ok) {
      return reply.status(422).send({
        error: 'dns_verification_failed',
        message:
          'DNS TXT record not found yet. Add the record at your DNS provider and wait for propagation (up to 48 hours).',
        dns_host: dnsTxtHost(domain),
        dns_txt_value: dnsTxtRecordValue(row.verification_token as string),
      })
    }

    const verifiedAt = new Date().toISOString()
    const { data: updated, error: updErr } = await admin
      .from('organization_domains')
      .update({
        verified: true,
        verified_at: verifiedAt,
        verification_method: 'dns_txt',
      })
      .eq('org_id', orgId)
      .eq('domain', domain)
      .select('domain, verified, verified_at, verification_method')
      .single()

    if (updErr) {
      return reply.status(500).send({
        error: 'domain_verify_failed',
        ...(!isProduction() && { detail: updErr.message }),
      })
    }

    logAdminAuditEvent(cfg, {
      orgId,
      actor: actorLabel(req as SanctumReq),
      action: 'organization_domain.verified',
      decision: 'APPROVED',
      risk: 'medium',
      reasoning: `DNS TXT verification succeeded for ${domain}. Company SSO auto-join is enabled for this domain.`,
      context: { domain, verification_method: 'dns_txt' },
    })

    return updated
  })

  app.delete('/v1/orgs/:orgId/domains/:domain', async (req, reply) => {
    const { orgId, domain: domainParam } = req.params as { orgId: string; domain: string }
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(401).send({ error: 'unauthorized' })

    if (!(await resolveOrgId(req as SanctumReq, orgId))) {
      return reply.status(403).send({ error: 'org_forbidden' })
    }

    try {
      await assertOrgRole(cfg, orgId, user.id, 'admin')
    } catch {
      return reply.status(403).send({ error: 'insufficient_role', required: 'admin' })
    }

    const domain = normalizeEmailDomain(decodeURIComponent(domainParam))
    if (!domain) return reply.status(400).send({ error: 'invalid_domain' })

    const admin = createSupabaseAdmin(cfg)
    const { error } = await admin
      .from('organization_domains')
      .delete()
      .eq('org_id', orgId)
      .eq('domain', domain)

    if (error) {
      return reply.status(500).send({
        error: 'domain_delete_failed',
        ...(!isProduction() && { detail: error.message }),
      })
    }

    logAdminAuditEvent(cfg, {
      orgId,
      actor: actorLabel(req as SanctumReq),
      action: 'organization_domain.removed',
      reasoning: `Work email domain ${domain} removed from Company SSO.`,
      context: { domain },
    })

    return { ok: true }
  })
}
