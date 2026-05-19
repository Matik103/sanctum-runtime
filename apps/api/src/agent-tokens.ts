import { createHmac } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { assertOrgRole } from './rbac.js'

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function signingSecret(): string {
  return (
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim() ||
    'dev-secret-change-me'
  )
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
  const expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  if (expected !== sig) return null
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
}
