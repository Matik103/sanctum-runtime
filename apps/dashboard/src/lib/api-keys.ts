import { getAccessToken } from './supabase'
import { throwResponseError } from './sanitize-error'

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
  if (!res.ok) await throwResponseError(res, 'Could not load API keys')
  return res.json() as Promise<ApiKeyRecord[]>
}

export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  const res = await fetch(`${apiBase}/v1/api-keys`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not create API key')
  return res.json() as Promise<CreateApiKeyResult>
}

export async function deleteApiKey(id: string): Promise<void> {
  const res = await fetch(`${apiBase}/v1/api-keys/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) await throwResponseError(res, 'Could not delete API key')
}

/** @deprecated use deleteApiKey */
export const revokeApiKey = deleteApiKey

export async function rotateApiKey(id: string): Promise<CreateApiKeyResult> {
  const res = await fetch(`${apiBase}/v1/api-keys/${id}/rotate`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) await throwResponseError(res, 'Could not rotate API key')
  return res.json() as Promise<CreateApiKeyResult>
}
