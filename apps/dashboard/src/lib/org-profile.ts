import { apiBaseUrl as apiBase } from './api-url'
import { getAccessToken } from './supabase'
import type { CompanySize, Industry } from './signup-fields'

export type AccountProfile = {
  id: string
  email: string | null
  display_name: string | null
  job_title: string | null
  country_code: string | null
  portal_type: string | null
  auth_provider: string | null
  accepted_terms_at: string | null
  terms_version: string | null
  created_at: string
  updated_at: string
  complete?: boolean
  missing?: string[]
}

export type OrgProfile = {
  id: string
  name: string
  legal_name: string | null
  website: string | null
  country_code: string | null
  company_size: CompanySize | null
  industry: Industry | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  primary_contact_title: string | null
  signup_source: string | null
  created_at: string
  updated_at: string
  is_personal_workspace: boolean
  caller_role: string
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function fetchAccountProfile(): Promise<AccountProfile | null> {
  const res = await fetch(`${apiBase}/v1/account/profile`, { headers: await authHeaders() })
  if (res.status === 401 || res.status === 404) return null
  if (!res.ok) throw new Error(`Account profile unavailable (${res.status})`)
  return res.json() as Promise<AccountProfile>
}

export async function updateAccountProfile(
  patch: Partial<Pick<AccountProfile, 'display_name' | 'job_title' | 'country_code'>> & {
    accept_terms?: boolean
  },
): Promise<AccountProfile> {
  const res = await fetch(`${apiBase}/v1/account/profile`, {
    method: 'PATCH',
    headers: await authHeaders(true),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string }
    throw new Error(body.detail ?? body.error ?? `Save failed (${res.status})`)
  }
  return res.json() as Promise<AccountProfile>
}

export async function fetchOrgProfile(orgId: string): Promise<OrgProfile | null> {
  const res = await fetch(`${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/profile`, {
    headers: await authHeaders(),
  })
  if (res.status === 403 || res.status === 404) return null
  if (!res.ok) throw new Error(`Organization profile unavailable (${res.status})`)
  return res.json() as Promise<OrgProfile>
}

export async function updateOrgProfile(
  orgId: string,
  patch: Record<string, unknown>,
): Promise<OrgProfile> {
  const res = await fetch(`${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/profile`, {
    method: 'PATCH',
    headers: await authHeaders(true),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string; error?: string }
    throw new Error(body.detail ?? body.error ?? `Save failed (${res.status})`)
  }
  return res.json() as Promise<OrgProfile>
}
