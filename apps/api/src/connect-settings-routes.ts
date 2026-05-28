import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { logger } from './logger.js'

const log = logger.child({ module: 'connect-settings' })

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

// Derive a stable 32-byte AES key from the server's secret.
// Falls back through available secrets; never uses a hardcoded prod value.
function settingsKey(): Buffer {
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

function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', settingsKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`
}

function decrypt(stored: string): string | null {
  try {
    const [ivHex, tagHex, ctHex] = stored.split(':')
    if (!ivHex || !tagHex || !ctHex) return null
    const decipher = createDecipheriv('aes-256-gcm', settingsKey(), Buffer.from(ivHex, 'hex'))
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

  // GET /v1/connect/settings?org_id=&platform=
  app.get('/v1/connect/settings', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.code(401).send({ error: 'unauthenticated' })

    const { org_id, platform } = req.query as { org_id?: string; platform?: string }
    if (!org_id || !platform) return reply.code(400).send({ error: 'org_id and platform are required' })

    const { data, error } = await admin
      .from('connect_settings')
      .select('agent_token_enc, platform_api_key_enc, updated_at')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .eq('platform', platform)
      .maybeSingle()

    if (error) {
      log.warn({ err: error.message, userId: user.id }, 'connect_settings fetch error')
      return reply.code(500).send({ error: 'Failed to load settings' })
    }
    if (!data) return reply.send({ exists: false })

    return reply.send({
      exists: true,
      agent_token:      data.agent_token_enc      ? decrypt(data.agent_token_enc)      : null,
      platform_api_key: data.platform_api_key_enc ? decrypt(data.platform_api_key_enc) : null,
      updated_at: data.updated_at,
    })
  })

  // PUT /v1/connect/settings
  app.put('/v1/connect/settings', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.code(401).send({ error: 'unauthenticated' })

    const body = z.object({
      org_id:           z.string().min(1).max(128),
      platform:         z.string().min(1).max(64),
      agent_token:      z.string().max(512).optional().nullable(),
      platform_api_key: z.string().max(512).optional().nullable(),
    }).parse(req.body)

    const row: Record<string, unknown> = {
      user_id:    user.id,
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
      log.warn({ err: error.message, userId: user.id }, 'connect_settings upsert error')
      return reply.code(500).send({ error: 'Failed to save settings' })
    }
    return reply.send({ ok: true })
  })

  // DELETE /v1/connect/settings?org_id=&platform=
  app.delete('/v1/connect/settings', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.code(401).send({ error: 'unauthenticated' })

    const { org_id, platform } = req.query as { org_id?: string; platform?: string }
    if (!org_id || !platform) return reply.code(400).send({ error: 'org_id and platform are required' })

    const { error } = await admin
      .from('connect_settings')
      .delete()
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .eq('platform', platform)

    if (error) {
      log.warn({ err: error.message, userId: user.id }, 'connect_settings delete error')
      return reply.code(500).send({ error: 'Failed to clear settings' })
    }
    return reply.send({ ok: true })
  })
}
