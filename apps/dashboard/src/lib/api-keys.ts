import { getAccessToken } from './supabase'

import { apiBaseUrl as apiBase } from './api-url'

export type ApiKeyRecord = {
  id: string
  name: string
  key_prefix: string
  key_suffix: string | null
  display_key: string
  org_id: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export type CreateApiKeyResult = ApiKeyRecord & {
  secret: string
  hint: string
}

async function authHeaders(json = false): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const res = await fetch(`${apiBase}/v1/api-keys`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`Failed to list API keys: ${res.status}`)
  return res.json() as Promise<ApiKeyRecord[]>
}

async function parseApiError(res: Response, fallback: string): Promise<never> {
  let detail = `${fallback} (${res.status})`
  try {
    const body = (await res.json()) as { detail?: string; error?: string }
    if (body.detail) detail = body.detail
    else if (body.error) detail = body.error.replace(/_/g, ' ')
  } catch {
    /* ignore */
  }
  throw new Error(detail)
}

export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  const res = await fetch(`${apiBase}/v1/api-keys`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) await parseApiError(res, 'Could not create API key')
  return res.json() as Promise<CreateApiKeyResult>
}

export async function deleteApiKey(id: string): Promise<void> {
  const res = await fetch(`${apiBase}/v1/api-keys/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) await parseApiError(res, 'Could not delete API key')
}

/** @deprecated use deleteApiKey */
export const revokeApiKey = deleteApiKey

export async function rotateApiKey(id: string): Promise<CreateApiKeyResult> {
  const res = await fetch(`${apiBase}/v1/api-keys/${id}/rotate`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) await parseApiError(res, 'Could not rotate API key')
  return res.json() as Promise<CreateApiKeyResult>
}
