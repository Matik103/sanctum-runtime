import { getAccessToken } from './supabase'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export type ApiKeyRecord = {
  id: string
  name: string
  key_prefix: string
  org_id: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export type CreateApiKeyResult = ApiKeyRecord & {
  secret: string
  hint: string
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const res = await fetch(`${apiBase}/v1/api-keys`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`Failed to list API keys: ${res.status}`)
  return res.json() as Promise<ApiKeyRecord[]>
}

export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  const res = await fetch(`${apiBase}/v1/api-keys`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`Failed to create API key: ${res.status}`)
  return res.json() as Promise<CreateApiKeyResult>
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`${apiBase}/v1/api-keys/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to revoke API key: ${res.status}`)
}
