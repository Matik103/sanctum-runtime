import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { encryptSecret, decryptSecret, getEncryptionKey } from './crypto-utils.js'
import { logger } from './logger.js'
import { PROXY_PLATFORMS } from './proxy-routes.js'

const log = logger.child({ module: 'platform-credentials' })

export const PLATFORM_IDS = Object.keys(PROXY_PLATFORMS) as Array<keyof typeof PROXY_PLATFORMS>

export type PlatformCredentialRow = {
  id: string
  org_id: string
  platform: string
  environment: string
  key_suffix: string
  default_agent_id: string | null
  proxy_base_url: string | null
  created_at: string
  updated_at: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

export type PlatformCredentialPublic = Omit<PlatformCredentialRow, 'secret_enc'> & {
  configured: true
}

export type PlatformCredentialMeta = {
  secret: string
  proxy_base_url: string | null
}

function keySuffix(secret: string): string {
  return secret.length >= 4 ? secret.slice(-4) : secret
}

export function isSupportedPlatform(platform: string): platform is keyof typeof PROXY_PLATFORMS {
  return platform in PROXY_PLATFORMS
}

export function resolvePlatformUpstreamBase(
  platform: string,
  proxyBaseUrl?: string | null,
): string | null {
  const custom = proxyBaseUrl?.trim().replace(/\/$/, '')
  if (platform === 'azure') return custom ?? null
  if (custom) return custom
  const base = PROXY_PLATFORMS[platform]
  return base?.trim() ? base.replace(/\/$/, '') : null
}

export function platformUpstreamAuthHeaders(
  platform: string,
  secret: string,
): Record<string, string> {
  const key = secret.trim().replace(/^Bearer\s+/i, '')
  if (platform === 'claude') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  }
  if (platform === 'azure') {
    return { 'api-key': key }
  }
  return {
    Authorization: secret.trim().startsWith('Bearer ') ? secret.trim() : `Bearer ${key}`,
  }
}

export async function listPlatformCredentials(
  cfg: SupabaseAuthConfig,
  orgId: string,
  environment?: string,
): Promise<PlatformCredentialPublic[]> {
  const admin = createSupabaseAdmin(cfg)
  let query = admin
    .from('platform_credentials')
    .select(
      'id, org_id, platform, environment, key_suffix, default_agent_id, proxy_base_url, created_at, updated_at, last_tested_at, last_test_ok, last_test_error',
    )
    .eq('org_id', orgId)
  if (environment) query = query.eq('environment', environment)
  const { data, error } = await query.order('platform')

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
    environment?: string
    proxyBaseUrl?: string | null
  },
): Promise<PlatformCredentialPublic> {
  if (!isSupportedPlatform(input.platform)) {
    throw new Error('unsupported_platform')
  }
  if (input.platform === 'azure' && !input.proxyBaseUrl?.trim()) {
    throw new Error('azure_base_url_required')
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
        environment: input.environment ?? 'production',
        key_suffix: keySuffix(input.secret.trim()),
        secret_enc: secretEnc,
        default_agent_id: input.defaultAgentId ?? null,
        proxy_base_url: input.proxyBaseUrl?.trim() || null,
        created_by: input.userId,
        updated_at: now,
      },
      { onConflict: 'org_id,platform,environment' },
    )
    .select(
      'id, org_id, platform, key_suffix, default_agent_id, proxy_base_url, created_at, updated_at, last_tested_at, last_test_ok, last_test_error, environment',
    )
    .single()

  if (error || !data) throw new Error(error?.message ?? 'upsert_failed')
  return { ...data, configured: true as const }
}

export async function deletePlatformCredential(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
  environment = 'production',
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const { error } = await admin
    .from('platform_credentials')
    .delete()
    .eq('org_id', orgId)
    .eq('platform', platform)
    .eq('environment', environment)
  if (error) throw new Error(error.message)
}

async function loadCredentialRow(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
  environment: string,
): Promise<{ secret_enc: string; proxy_base_url: string | null } | null> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('platform_credentials')
    .select('secret_enc, proxy_base_url')
    .eq('org_id', orgId)
    .eq('platform', platform)
    .eq('environment', environment)
    .maybeSingle()
  if (error || !data?.secret_enc) return null
  return data as { secret_enc: string; proxy_base_url: string | null }
}

export async function getPlatformCredentialMeta(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
  environment = 'production',
  tried: Set<string> = new Set(),
): Promise<PlatformCredentialMeta | null> {
  if (tried.has(environment)) return null
  tried.add(environment)

  const row = await loadCredentialRow(cfg, orgId, platform, environment)
  if (!row) {
    if (environment !== 'production') {
      return getPlatformCredentialMeta(cfg, orgId, platform, 'production', tried)
    }
    if (environment !== 'development') {
      return getPlatformCredentialMeta(cfg, orgId, platform, 'development', tried)
    }
    return null
  }
  try {
    const secret = await decryptSecret(row.secret_enc, getEncryptionKey())
    return { secret, proxy_base_url: row.proxy_base_url }
  } catch (err) {
    log.warn({ err, orgId, platform, environment }, 'platform credential decrypt failed')
    if (environment === 'production') {
      return getPlatformCredentialMeta(cfg, orgId, platform, 'development', tried)
    }
    return null
  }
}

/** @deprecated use getPlatformCredentialMeta */
export async function getPlatformSecret(
  cfg: SupabaseAuthConfig,
  orgId: string,
  platform: string,
  environment = 'production',
  tried: Set<string> = new Set(),
): Promise<string | null> {
  const meta = await getPlatformCredentialMeta(cfg, orgId, platform, environment, tried)
  return meta?.secret ?? null
}

export async function testPlatformSecret(
  platform: string,
  secret: string,
  proxyBaseUrl?: string | null,
): Promise<{ ok: boolean; detail?: string; status?: number }> {
  if (!isSupportedPlatform(platform)) {
    return { ok: false, detail: 'unsupported_platform' }
  }
  const base = resolvePlatformUpstreamBase(platform, proxyBaseUrl)
  if (!base) {
    return { ok: false, detail: platform === 'azure' ? 'azure_base_url_required' : 'missing_base_url' }
  }
  const headers = platformUpstreamAuthHeaders(platform, secret)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  const modelsPath = platform === 'azure' ? `${base}/models?api-version=2024-02-01` : `${base}/models`
  try {
    const res = await fetch(modelsPath, { headers, signal: controller.signal })
    if (res.ok) {
      return { ok: true, detail: 'models_list_ok', status: res.status }
    }
    if (platform === 'claude' && res.status === 404) {
      return { ok: true, detail: 'claude_auth_ok', status: res.status }
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
  environment = 'production',
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
    .eq('environment', environment)
}
