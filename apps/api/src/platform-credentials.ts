import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { encryptSecret, decryptSecret, getEncryptionKey } from './crypto-utils.js'
import { PROXY_PLATFORMS } from './proxy-routes.js'

export const PLATFORM_IDS = Object.keys(PROXY_PLATFORMS) as Array<keyof typeof PROXY_PLATFORMS>

export type PlatformCredentialRow = {
  id: string
  org_id: string
  platform: string
  key_suffix: string
  default_agent_id: string | null
  created_at: string
  updated_at: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

export type PlatformCredentialPublic = Omit<PlatformCredentialRow, 'secret_enc'> & {
  configured: true
}

function keySuffix(secret: string): string {
  return secret.length >= 4 ? secret.slice(-4) : secret
}

export function isSupportedPlatform(platform: string): platform is keyof typeof PROXY_PLATFORMS {
  return platform in PROXY_PLATFORMS
}

export async function listPlatformCredentials(
  cfg: SupabaseAuthConfig,
  orgId: string,
): Promise<PlatformCredentialPublic[]> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('platform_credentials')
    .select(
      'id, org_id, platform, key_suffix, default_agent_id, created_at, updated_at, last_tested_at, last_test_ok, last_test_error',
    )
    .eq('org_id', orgId)
    .order('platform')

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ ...row, configured: true as const }))
}

export async function upsertPlatformCredential(
  cfg: SupabaseAuthConfig,
  input: {
    orgId: string
    platform: string
    secret: string
    userId: string
    defaultAgentId?: string | null
  },
): Promise<PlatformCredentialPublic> {
  if (!isSupportedPlatform(input.platform)) {
    throw new Error('unsupported_platform')
  }
  const encKey = getEncryptionKey()
  const secretEnc = await encryptSecret(input.secret.trim(), encKey)
  const admin = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('platform_credentials')
    .upsert(
      {
        org_id: input.orgId,
        platform: input.platform,
        key_suffix: keySuffix(input.secret.trim()),
        secret_enc: secretEnc,
        default_agent_id: input.defaultAgentId ?? null,
        created_by: input.userId,
        updated_at: now,
      },
      { onConflict: 'org_id,platform' },
    )
    .select(
      'id, org_id, platform, key_suffix, default_agent_id, created_at, updated_at, last_tested_at, last_test_ok, last_test_error',
    )
    .single()

  if (error || !data) throw new Error(error?.message ?? 'upsert_failed')
  return { ...data, configured: true as const }
}

export async function deletePlatformCredential(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const { error } = await admin
    .from('platform_credentials')
    .delete()
    .eq('org_id', orgId)
    .eq('platform', platform)
  if (error) throw new Error(error.message)
}

export async function getPlatformSecret(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
): Promise<string | null> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('platform_credentials')
    .select('secret_enc')
    .eq('org_id', orgId)
    .eq('platform', platform)
    .maybeSingle()

  if (error || !data?.secret_enc) return null
  return decryptSecret(data.secret_enc, getEncryptionKey())
}

export async function testPlatformSecret(
  platform: string,
  secret: string,
): Promise<{ ok: boolean; detail?: string; status?: number }> {
  if (!isSupportedPlatform(platform)) {
    return { ok: false, detail: 'unsupported_platform' }
  }
  const base = PROXY_PLATFORMS[platform]
  const auth = secret.trim().startsWith('Bearer ') ? secret.trim() : `Bearer ${secret.trim()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: auth },
      signal: controller.signal,
    })
    if (res.ok) {
      return { ok: true, detail: 'models_list_ok', status: res.status }
    }
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      detail: body.slice(0, 200) || res.statusText || 'upstream_error',
      status: res.status,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, detail: msg }
  } finally {
    clearTimeout(timer)
  }
}

export async function recordPlatformTestResult(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
  result: { ok: boolean; detail?: string },
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  await admin
    .from('platform_credentials')
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_error: result.ok ? null : (result.detail ?? 'test_failed').slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .eq('platform', platform)
}
