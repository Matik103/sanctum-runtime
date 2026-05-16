import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  org_id: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function generateSecret(): string {
  return `sk_sanctum_${randomBytes(24).toString('base64url')}`
}

export async function registerApiKeyRoutes(
  app: FastifyInstance,
  supabase: SupabaseAuthConfig,
) {
  const admin = createSupabaseAdmin(supabase)

  app.get('/v1/api-keys', async (req, reply) => {
    const user = (req as { sanctumUser?: { id: string } }).sanctumUser
    if (!user) {
      return reply.status(403).send({ error: 'dashboard_auth_required' })
    }

    const { data, error } = await admin
      .from('api_keys')
      .select('id, name, key_prefix, org_id, created_at, revoked_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return reply.status(500).send({ error: 'api_keys_list_failed', detail: error.message })
    }
    return data as ApiKeyRow[]
  })

  app.post('/v1/api-keys', async (req, reply) => {
    const user = (req as { sanctumUser?: { id: string } }).sanctumUser
    if (!user) {
      return reply.status(403).send({ error: 'dashboard_auth_required' })
    }

    const body = z
      .object({
        name: z.string().min(1).max(120),
        org_id: z.string().optional(),
      })
      .parse(req.body)

    const secret = generateSecret()
    const prefix = secret.slice(0, 16)

    const { data, error } = await admin
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: body.name.trim(),
        org_id: body.org_id ?? null,
        key_prefix: prefix,
        key_hash: hashKey(secret),
      })
      .select('id, name, key_prefix, org_id, created_at')
      .single()

    if (error) {
      return reply.status(500).send({ error: 'api_keys_create_failed', detail: error.message })
    }

    return {
      ...data,
      secret,
      hint: 'Copy the secret now — it will not be shown again.',
    }
  })

  app.delete('/v1/api-keys/:id', async (req, reply) => {
    const user = (req as { sanctumUser?: { id: string } }).sanctumUser
    if (!user) {
      return reply.status(403).send({ error: 'dashboard_auth_required' })
    }

    const { id } = req.params as { id: string }

    const { error } = await admin
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('revoked_at', null)

    if (error) {
      return reply.status(500).send({ error: 'api_keys_revoke_failed', detail: error.message })
    }
    return { ok: true }
  })
}

/** Validate hashed keys from DB (future: replace single SANCTUM_API_KEY). */
export async function validateStoredApiKey(
  supabase: SupabaseAuthConfig,
  presentedKey: string,
): Promise<boolean> {
  if (!presentedKey.startsWith('sk_sanctum_')) return false
  const admin = createSupabaseAdmin(supabase)
  const prefix = presentedKey.slice(0, 16)
  const { data } = await admin
    .from('api_keys')
    .select('id, key_hash')
    .eq('key_prefix', prefix)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle()

  if (!data) return false
  const ok = data.key_hash === hashKey(presentedKey)
  if (ok) {
    await admin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
  }
  return ok
}
