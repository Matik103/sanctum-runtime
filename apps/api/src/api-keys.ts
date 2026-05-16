import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateApiKeySecret,
  hashApiKeyLegacy,
  hashApiKeyV1,
  keyDisplayParts,
  verifyApiKey,
} from './api-key-crypto.js'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  key_suffix: string | null
  org_id: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
  hash_version: string
  scopes: string[]
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
      .select(
        'id, name, key_prefix, key_suffix, org_id, created_at, revoked_at, last_used_at, hash_version, scopes',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return reply.status(500).send({ error: 'api_keys_list_failed', detail: error.message })
    }
    return (data ?? []).map((row) => ({
      ...row,
      display_key: formatDisplayKey(row.key_prefix, row.key_suffix),
    }))
  })

  app.post('/v1/api-keys', async (req, reply) => {
    try {
      const user = (req as { sanctumUser?: { id: string } }).sanctumUser
      if (!user) {
        return reply.status(403).send({ error: 'dashboard_auth_required' })
      }

      const parsed = z
        .object({
          name: z.string().min(1).max(120),
          org_id: z.string().optional(),
        })
        .safeParse(req.body)

      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_error', details: parsed.error.flatten() })
      }

      const secret = generateApiKeySecret()
      const { prefix, suffix } = keyDisplayParts(secret)
      const keyHash = await hashApiKeyV1(secret)

      const store = new ControlPlaneStore(supabase)
      const userOrgIds = await store.getUserOrgIds(user.id)
      const orgId = parsed.data.org_id ?? userOrgIds[0] ?? null

      const { data, error } = await admin
        .from('api_keys')
        .insert({
          user_id: user.id,
          name: parsed.data.name.trim(),
          org_id: orgId,
          key_prefix: prefix,
          key_suffix: suffix,
          key_hash: keyHash,
          hash_version: 'bcrypt_v1',
          scopes: ['api'],
        })
        .select('id, name, key_prefix, key_suffix, org_id, created_at')
        .single()

      if (error) {
        req.log.error({ err: error }, 'api_keys_create_failed')
        return reply.status(500).send({ error: 'api_keys_create_failed', detail: error.message })
      }

      return {
        ...data,
        secret,
        display_key: formatDisplayKey(prefix, suffix),
        hint: 'Copy this secret now. You will not be able to see it again.',
      }
    } catch (e) {
      req.log.error(e, 'api_keys_create_exception')
      const detail = e instanceof Error ? e.message : 'create_failed'
      const code =
        detail.includes('PEPPER') || detail.includes('SERVICE_ROLE')
          ? 'pepper_not_configured'
          : 'api_keys_create_failed'
      return reply.status(500).send({ error: code, detail })
    }
  })

  /** Delete key permanently (OpenAI-style — removed from list, auth stops immediately). */
  app.delete('/v1/api-keys/:id', async (req, reply) => {
    try {
      const user = (req as { sanctumUser?: { id: string } }).sanctumUser
      if (!user) {
        return reply.status(403).send({ error: 'dashboard_auth_required' })
      }

      const rawId = (req.params as { id?: string }).id?.trim()
      const parsed = z.string().uuid().safeParse(rawId)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'invalid_id' })
      }
      const id = parsed.data

      const { data, error } = await admin
        .from('api_keys')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id')

      if (error) {
        req.log.error({ err: error, keyId: id }, 'api_keys_delete_failed')
        return reply.status(500).send({ error: 'api_keys_delete_failed', detail: error.message })
      }
      if (!data?.length) {
        return reply.status(404).send({ error: 'api_key_not_found' })
      }
      return { ok: true, deleted: true }
    } catch (e) {
      req.log.error(e, 'api_keys_delete_exception')
      const detail = e instanceof Error ? e.message : 'delete_failed'
      return reply.status(500).send({ error: 'api_keys_delete_failed', detail })
    }
  })
}

function formatDisplayKey(prefix: string, suffix: string | null): string {
  if (suffix) return `${prefix}…${suffix}`
  return `${prefix}…`
}

/** Validate dashboard-issued keys (peppered bcrypt or legacy sha256). */
export async function validateStoredApiKey(
  supabase: SupabaseAuthConfig,
  presentedKey: string,
): Promise<boolean> {
  if (!presentedKey.startsWith('sk_sanctum_')) return false
  const admin = createSupabaseAdmin(supabase)
  const prefix = presentedKey.slice(0, 16)
  const { data } = await admin
    .from('api_keys')
    .select('id, key_hash, hash_version')
    .eq('key_prefix', prefix)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle()

  if (!data) return false
  const version = (data.hash_version as string) ?? 'sha256_v1'
  const ok = await verifyApiKey(presentedKey, data.key_hash as string, version)
  if (ok) {
    await admin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
  }
  return ok
}

/** @deprecated use hashApiKeyV1 — kept for tests referencing legacy */
export function hashKey(secret: string): string {
  return hashApiKeyLegacy(secret)
}
