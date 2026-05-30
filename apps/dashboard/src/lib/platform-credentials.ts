import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

export type PlatformId = 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'doubao' | 'gemini'

export type PlatformCredential = {
  id: string
  org_id: string
  platform: PlatformId
  environment?: string
  key_suffix: string
  default_agent_id: string | null
  configured: true
  created_at: string
  updated_at: string
  last_tested_at: string | null
  last_test_ok: boolean | null
  last_test_error: string | null
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export async function listPlatformCredentials(
  orgId: string,
  environment?: string,
): Promise<PlatformCredential[]> {
  const qs = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/platform-credentials${qs}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`list_platform_credentials_${res.status}`)
  const data = (await res.json()) as { credentials?: PlatformCredential[] }
  return data.credentials ?? []
}

export async function savePlatformCredential(
  orgId: string,
  platform: PlatformId,
  secret: string,
  defaultAgentId?: string | null,
  environment?: 'development' | 'staging' | 'production',
): Promise<PlatformCredential> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/platform-credentials/${platform}`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify({
      secret,
      default_agent_id: defaultAgentId ?? null,
      environment,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `save_platform_credential_${res.status}`)
  }
  return res.json() as Promise<PlatformCredential>
}

export async function deletePlatformCredential(
  orgId: string,
  platform: PlatformId,
  environment?: string,
): Promise<void> {
  const qs = environment ? `?environment=${encodeURIComponent(environment)}` : ''
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/platform-credentials/${platform}${qs}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`delete_platform_credential_${res.status}`)
}

export async function testPlatformCredential(
  orgId: string,
  platform: PlatformId,
  secret?: string,
  environment?: 'development' | 'staging' | 'production',
): Promise<{ ok: boolean; detail?: string; status?: number }> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/platform-credentials/${platform}/test`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify(secret ? { secret, environment } : { environment }),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; detail?: string; status?: number; error?: string }
  if (!res.ok && !data.ok) throw new Error(data.error ?? `test_platform_credential_${res.status}`)
  return { ok: Boolean(data.ok), detail: data.detail, status: data.status }
}
