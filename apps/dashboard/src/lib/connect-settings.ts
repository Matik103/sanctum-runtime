import { getAccessToken } from './supabase'
import { apiBaseUrl } from './api-url'

export type ConnectSettings = {
  exists: boolean
  agent_token: string | null
  platform_api_key: string | null
  updated_at: string | null
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function getConnectSettings(orgId: string, platform: string): Promise<ConnectSettings | null> {
  const res = await fetch(
    `${apiBaseUrl}/v1/connect/settings?org_id=${encodeURIComponent(orgId)}&platform=${encodeURIComponent(platform)}`,
    { headers: await authHeaders() },
  )
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Failed to load settings (${res.status})`)
  return res.json() as Promise<ConnectSettings>
}

export async function saveConnectSettings(
  orgId: string,
  platform: string,
  updates: { agent_token?: string | null; platform_api_key?: string | null },
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/connect/settings`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify({ org_id: orgId, platform, ...updates }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Failed to save settings (${res.status})`)
  }
}

export async function clearConnectSettings(orgId: string, platform: string): Promise<void> {
  const res = await fetch(
    `${apiBaseUrl}/v1/connect/settings?org_id=${encodeURIComponent(orgId)}&platform=${encodeURIComponent(platform)}`,
    { method: 'DELETE', headers: await authHeaders() },
  )
  if (!res.ok) throw new Error(`Failed to clear settings (${res.status})`)
}
