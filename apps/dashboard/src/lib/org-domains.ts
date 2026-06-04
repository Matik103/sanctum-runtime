import { apiBaseUrl as apiBase } from './api-url'
import { getAccessToken } from './supabase'

export type OrgDomain = {
  domain: string
  verified: boolean
  verified_at: string | null
  verification_method: string | null
  created_at: string
  updated_at: string
  dns_host: string
  dns_txt_value: string | null
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function fetchOrgDomains(orgId: string): Promise<OrgDomain[]> {
  const res = await fetch(`${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/domains`, {
    headers: await authHeaders(),
  })
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { feature?: string; message?: string }
    const err = new Error(body.message ?? 'Domain management requires Team plan.')
    ;(err as Error & { code: string }).code = 'plan_feature_required'
    throw err
  }
  if (!res.ok) throw new Error(`Domains unavailable (${res.status})`)
  const data = (await res.json()) as { domains: OrgDomain[] }
  return data.domains ?? []
}

export async function addOrgDomain(
  orgId: string,
  domain: string,
): Promise<OrgDomain & { dns_host: string; dns_txt_value: string }> {
  const res = await fetch(`${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/domains`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ domain }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(body.message ?? body.error ?? `Add domain failed (${res.status})`)
  }
  return res.json() as Promise<OrgDomain & { dns_host: string; dns_txt_value: string }>
}

export async function verifyOrgDomain(orgId: string, domain: string): Promise<OrgDomain> {
  const res = await fetch(
    `${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/domains/${encodeURIComponent(domain)}/verify`,
    { method: 'POST', headers: await authHeaders(true) },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string
      error?: string
      dns_host?: string
      dns_txt_value?: string
    }
    const err = new Error(body.message ?? body.error ?? `Verification failed (${res.status})`)
    ;(err as Error & { dns_host?: string; dns_txt_value?: string }).dns_host = body.dns_host
    ;(err as Error & { dns_txt_value?: string }).dns_txt_value = body.dns_txt_value
    throw err
  }
  return res.json() as Promise<OrgDomain>
}

export async function removeOrgDomain(orgId: string, domain: string): Promise<void> {
  const res = await fetch(
    `${apiBase}/v1/orgs/${encodeURIComponent(orgId)}/domains/${encodeURIComponent(domain)}`,
    { method: 'DELETE', headers: await authHeaders() },
  )
  if (!res.ok) throw new Error(`Remove domain failed (${res.status})`)
}
