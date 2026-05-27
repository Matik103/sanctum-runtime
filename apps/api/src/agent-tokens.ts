import { createHmac, timingSafeEqual } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { assertOrgRole } from './rbac.js'

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

function signingSecret(): string {
  const key =
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim()

  if (key) return key

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.SANCTUM_ENV === 'production'
  ) {
    throw new Error(
      'SANCTUM_API_KEY_PEPPER or SANCTUM_API_KEY must be set in production for agent token signing',
    )
  }

  return 'dev-secret-change-me'
}

/** Issue a signed agent token encoding the registration ID and org. */
export function issueAgentToken(registrationId: string, orgId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ id: registrationId, orgId, iat: Date.now() }),
  ).toString('base64url')
  const sig = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  return `sk_agent_${payload}.${sig}`
}

/** Verify a token and return its claims, or null if invalid/tampered. */
export function verifyAgentToken(token: string): { id: string; orgId: string } | null {
  if (!token.startsWith('sk_agent_')) return null
  const rest = token.slice('sk_agent_'.length)
  const dotIdx = rest.lastIndexOf('.')
  if (dotIdx < 0) return null
  const payload = rest.slice(0, dotIdx)
  const sig = rest.slice(dotIdx + 1)
  const expectedBuf = Buffer.from(createHmac('sha256', signingSecret()).update(payload).digest('base64url'))
  const sigBuf = Buffer.from(sig)
  if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      id: string
      orgId: string
      iat: number
    }
    if (!data.id || !data.orgId) return null
    return { id: data.id, orgId: data.orgId }
  } catch {
    return null
  }
}

/** Extract agent token from request headers (X-Agent-Token or Authorization: Agent ...). */
export function extractAgentToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = req.headers['x-agent-token']
  if (header) return Array.isArray(header) ? header[0] : header
  const auth = req.headers['authorization']
  const authStr = Array.isArray(auth) ? auth[0] : auth
  if (authStr?.startsWith('Agent ')) return authStr.slice(6)
  return null
}

export async function registerAgentTokenRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const store = new ControlPlaneStore(cfg)
  const orgIdSchema = z.string().min(1).max(128)

  async function resolveUser(req: SanctumReq, orgId: string, minRole: 'member' | 'admin' = 'admin') {
    if (req.sanctumUser) {
      try {
        await assertOrgRole(cfg, orgId, req.sanctumUser.id, minRole)
        return { ok: true as const, userId: req.sanctumUser.id }
      } catch {
        return { ok: false as const }
      }
    }
    if (req.sanctumApiKeyScope !== undefined) {
      if (!req.sanctumApiKeyScope.includes(orgId)) return { ok: false as const }
      return { ok: true as const, userId: undefined }
    }
    const rawKey = req.headers['x-sanctum-key']
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg !== orgId) return { ok: false as const }
      return { ok: true as const, userId: undefined }
    }
    return { ok: false as const }
  }

  // List agent registrations
  app.get('/v1/orgs/:orgId/agents', async (req, reply) => {
    const orgId = orgIdSchema.parse((req.params as { orgId: string }).orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const { data, error } = await admin
      .from('agent_registrations')
      .select('id,org_id,name,description,token_hint,created_by,created_at,last_seen_at')
      .eq('org_id', orgId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    if (error) return reply.status(500).send({ error: error.message })
    return data ?? []
  })

  // Register a new agent — returns the token once (not stored, not recoverable)
  app.post('/v1/orgs/:orgId/agents', async (req, reply) => {
    const orgId = orgIdSchema.parse((req.params as { orgId: string }).orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const body = z.object({
      name: z.string().min(1).max(128),
      description: z.string().max(512).optional(),
    }).parse(req.body)

    // Insert registration row to get an ID
    const { data: row, error: insertErr } = await admin
      .from('agent_registrations')
      .insert({ org_id: orgId, name: body.name, description: body.description ?? null, token_hint: '????', created_by: access.userId ?? null })
      .select('id')
      .single()

    if (insertErr || !row) return reply.status(500).send({ error: insertErr?.message ?? 'insert_failed' })

    const token = issueAgentToken(row.id as string, orgId)
    const hint = token.slice(-6)

    // Store the hint for display
    await admin.from('agent_registrations').update({ token_hint: hint }).eq('id', row.id)

    return reply.status(201).send({
      id: row.id,
      org_id: orgId,
      name: body.name,
      token,  // shown once — agent must store this immediately
      token_hint: hint,
      note: 'Store this token now — it cannot be retrieved again. Pass it as X-Agent-Token header or Authorization: Agent <token>.',
    })
  })

  // Revoke an agent registration
  app.delete('/v1/orgs/:orgId/agents/:agentId', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const { error } = await admin
      .from('agent_registrations')
      .update({ revoked_at: new Date().toISOString(), revoked_by: access.userId ?? 'api' })
      .eq('id', agentId)
      .eq('org_id', orgId)

    if (error) return reply.status(500).send({ error: error.message })
    return { ok: true }
  })

  // Token rotation — POST /v1/orgs/:orgId/agents/:agentId/rotate
  app.post('/v1/orgs/:orgId/agents/:agentId/rotate', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    // Issue new token (new iat — later than any previous token)
    const newIat = Date.now()
    const payload = Buffer.from(JSON.stringify({ id: agentId, orgId, iat: newIat })).toString('base64url')
    const { createHmac } = await import('crypto')
    const sig = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
    const token = `sk_agent_${payload}.${sig}`
    const hint = token.slice(-6)

    // Invalidate all previous tokens by setting token_iat_min = newIat
    const { error } = await admin
      .from('agent_registrations')
      .update({ token_hint: hint, token_iat_min: newIat })
      .eq('id', agentId)
      .eq('org_id', orgId)
      .is('revoked_at', null)

    if (error) return reply.status(500).send({ error: error.message })
    return reply.status(200).send({
      token,
      token_hint: hint,
      note: 'Previous token is now invalid. Store this token immediately — it cannot be retrieved again.',
    })
  })

  // Per-agent audit log — GET /v1/orgs/:orgId/agents/:agentId/audit
  app.get('/v1/orgs/:orgId/agents/:agentId/audit', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const q = req.query as { limit?: string }
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50) || 50))

    // Get agent name to use as actor filter
    const { data: reg } = await admin
      .from('agent_registrations')
      .select('name')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!reg) return reply.status(404).send({ error: 'agent_not_found' })

    const { data, error } = await admin
      .from('audit_events')
      .select('id,actor,action,decision,risk,reasoning,anomaly_flags,shield_level,shield_score,created_at')
      .eq('org_id', orgId)
      .eq('actor', reg.name)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return reply.status(500).send({ error: error.message })
    return { entries: data ?? [], actor: reg.name }
  })

  // Per-agent stats — GET /v1/orgs/:orgId/agents/:agentId/stats
  app.get('/v1/orgs/:orgId/agents/:agentId/stats', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const { data: reg } = await admin
      .from('agent_registrations')
      .select('name')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!reg) return reply.status(404).send({ error: 'agent_not_found' })

    const since24h = new Date(Date.now() - 86_400_000).toISOString()

    const { data, error } = await admin
      .from('audit_events')
      .select('decision,shield_level,shield_score,created_at')
      .eq('org_id', orgId)
      .eq('actor', reg.name)
      .gte('created_at', since24h)

    if (error) return reply.status(500).send({ error: error.message })

    const rows = (data ?? []) as Array<{ decision: string; shield_level: string | null; shield_score: number | null; created_at: string }>
    const blocked24h = rows.filter(r => r.decision === 'BLOCKED').length
    const held24h = rows.filter(r => r.decision === 'REQUIRE_VERIFICATION').length
    const approved24h = rows.filter(r => r.decision === 'APPROVED').length
    const shieldLevels = ['critical', 'high', 'elevated', 'clear']
    const worstShield = shieldLevels.find(l => rows.some(r => r.shield_level === l)) ?? null
    const maxScore = rows.reduce((m, r) => Math.max(m, r.shield_score ?? 0), 0)

    return { blocked24h, held24h, approved24h, total24h: rows.length, worstShield, maxScore, actor: reg.name }
  })

  // Per-agent grants — GET /v1/orgs/:orgId/agents/:agentId/grants
  app.get('/v1/orgs/:orgId/agents/:agentId/grants', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const { data: reg } = await admin
      .from('agent_registrations')
      .select('name')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!reg) return reply.status(404).send({ error: 'agent_not_found' })

    const { data, error } = await admin
      .from('policy_grants')
      .select('*')
      .eq('org_id', orgId)
      .eq('actor', reg.name)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })

    if (error) return reply.status(500).send({ error: error.message })
    return { grants: data ?? [], actor: reg.name }
  })

  // Create grant for agent — POST /v1/orgs/:orgId/agents/:agentId/grants
  app.post('/v1/orgs/:orgId/agents/:agentId/grants', async (req, reply) => {
    const { orgId, agentId } = req.params as { orgId: string; agentId: string }
    orgIdSchema.parse(orgId)
    const access = await resolveUser(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const body = z.object({
      action: z.string().min(1).max(200),
      durationMinutes: z.number().int().min(1).max(10080), // max 1 week
    }).parse(req.body)

    const { data: reg } = await admin
      .from('agent_registrations')
      .select('name')
      .eq('id', agentId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!reg) return reply.status(404).send({ error: 'agent_not_found' })

    const expiresAt = new Date(Date.now() + body.durationMinutes * 60_000).toISOString()
    const { data, error } = await admin
      .from('policy_grants')
      .insert({
        org_id: orgId,
        action: body.action,
        actor: reg.name,
        granted_by: access.userId ?? 'operator',
        duration_minutes: body.durationMinutes,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (error || !data) return reply.status(500).send({ error: error?.message ?? 'Failed to create grant' })
    return reply.status(201).send({ grant: data })
  })
}
