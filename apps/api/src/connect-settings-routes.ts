import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { logger } from './logger.js'
import { assertOrgAllowed, resolveOrgScope, type SanctumReq } from './org-scope.js'
import { ControlPlaneStore } from './control-plane-store.js'

const log = logger.child({ module: 'connect-settings' })

// Compute the AES key once at module load — the source env vars are process-lifetime
// constants. Deferring to call-time would recompute a SHA-256 hash on every
// encrypt/decrypt and make misconfiguration silent until first use.
function deriveSettingsKey(): Buffer {
  const raw =
    process.env.SANCTUM_SECRETS_KEY?.trim() ||
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim()

  if (!raw) {
    if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
      throw new Error('SANCTUM_SECRETS_KEY must be set in production for connect settings encryption')
    }
    return createHash('sha256').update('dev-settings-key-not-for-prod').digest()
  }

  return createHash('sha256').update(raw).digest()
}

const SETTINGS_KEY = deriveSettingsKey()

function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', SETTINGS_KEY, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`
}

function decrypt(stored: string): string | null {
  try {
    const [ivHex, tagHex, ctHex] = stored.split(':')
    if (!ivHex || !tagHex || !ctHex) return null
    const decipher = createDecipheriv('aes-256-gcm', SETTINGS_KEY, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8')
  } catch {
    return null
  }
}

export async function registerConnectSettingsRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const store = new ControlPlaneStore(cfg)

  // GET /v1/connect/settings?org_id=&platform=
  app.get('/v1/connect/settings', async (req, reply) => {
    const sanctumReq = req as SanctumReq
    if (!sanctumReq.sanctumUser) return reply.code(401).send({ error: 'unauthenticated' })

    const { org_id, platform } = req.query as { org_id?: string; platform?: string }
    if (!org_id || !platform) return reply.code(400).send({ error: 'org_id and platform are required' })

    const scope = await resolveOrgScope(sanctumReq, store)
    if (!assertOrgAllowed(scope, org_id, reply)) return

    const { data, error } = await admin
      .from('connect_settings')
      .select('agent_token_enc, platform_api_key_enc, updated_at')
      .eq('user_id', sanctumReq.sanctumUser.id)
      .eq('org_id', org_id)
      .eq('platform', platform)
      .maybeSingle()

    if (error) {
      log.warn({ err: error.message, userId: sanctumReq.sanctumUser.id }, 'connect_settings fetch error')
      return reply.code(500).send({ error: 'Failed to load settings' })
    }
    if (!data) return reply.send({ exists: false })

    const agentToken      = data.agent_token_enc      ? decrypt(data.agent_token_enc)      : null
    const platformApiKey  = data.platform_api_key_enc ? decrypt(data.platform_api_key_enc) : null

    // Log a warning if decryption fails — likely means the key was rotated
    if (data.agent_token_enc && agentToken === null)
      log.warn({ userId: sanctumReq.sanctumUser.id, org_id }, 'agent_token decryption failed — key may have been rotated')
    if (data.platform_api_key_enc && platformApiKey === null)
      log.warn({ userId: sanctumReq.sanctumUser.id, org_id }, 'platform_api_key decryption failed — key may have been rotated')

    return reply.send({
      exists: true,
      agent_token: agentToken,
      platform_api_key: platformApiKey,
      // Signal decryption failure so the UI can prompt re-entry instead of silently showing blank fields
      decryption_failed: (data.agent_token_enc && agentToken === null) || (data.platform_api_key_enc && platformApiKey === null),
      updated_at: data.updated_at,
    })
  })

  // PUT /v1/connect/settings
  app.put('/v1/connect/settings', async (req, reply) => {
    const sanctumReq = req as SanctumReq
    if (!sanctumReq.sanctumUser) return reply.code(401).send({ error: 'unauthenticated' })

    const body = z.object({
      org_id:           z.string().min(1).max(128),
      platform:         z.string().min(1).max(64),
      agent_token:      z.string().max(512).optional().nullable(),
      platform_api_key: z.string().max(512).optional().nullable(),
    }).parse(req.body)

    const scope = await resolveOrgScope(sanctumReq, store)
    if (!assertOrgAllowed(scope, body.org_id, reply)) return

    const row: Record<string, unknown> = {
      user_id:    sanctumReq.sanctumUser.id,
      org_id:     body.org_id,
      platform:   body.platform,
      updated_at: new Date().toISOString(),
    }

    if (body.agent_token !== undefined) {
      row.agent_token_enc = body.agent_token ? encrypt(body.agent_token) : null
    }
    if (body.platform_api_key !== undefined) {
      row.platform_api_key_enc = body.platform_api_key ? encrypt(body.platform_api_key) : null
    }

    const { error } = await admin
      .from('connect_settings')
      .upsert(row, { onConflict: 'user_id,org_id,platform' })

    if (error) {
      log.warn({ err: error.message, userId: sanctumReq.sanctumUser.id }, 'connect_settings upsert error')
      return reply.code(500).send({ error: 'Failed to save settings' })
    }
    return reply.send({ ok: true })
  })

  // DELETE /v1/connect/settings?org_id=&platform=
  app.delete('/v1/connect/settings', async (req, reply) => {
    const sanctumReq = req as SanctumReq
    if (!sanctumReq.sanctumUser) return reply.code(401).send({ error: 'unauthenticated' })

    const { org_id, platform } = req.query as { org_id?: string; platform?: string }
    if (!org_id || !platform) return reply.code(400).send({ error: 'org_id and platform are required' })

    const scope = await resolveOrgScope(sanctumReq, store)
    if (!assertOrgAllowed(scope, org_id, reply)) return

    const { error } = await admin
      .from('connect_settings')
      .delete()
      .eq('user_id', sanctumReq.sanctumUser.id)
      .eq('org_id', org_id)
      .eq('platform', platform)

    if (error) {
      log.warn({ err: error.message, userId: sanctumReq.sanctumUser.id }, 'connect_settings delete error')
      return reply.code(500).send({ error: 'Failed to clear settings' })
    }
    return reply.send({ ok: true })
  })
}
