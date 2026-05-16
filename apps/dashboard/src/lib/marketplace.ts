import { getAccessToken } from './supabase'
import { fetchMyOrgs, type FleetOrg } from './fleet'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export type MarketplacePackage = {
  id: string
  slug: string
  name: string
  description: string | null
  version: string
  publisher: string
  category: string
  installed: boolean
  installId: string | null
  readme: string | null
}

async function headers(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function fetchMarketplacePackages(orgId?: string): Promise<MarketplacePackage[]> {
  const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
  const res = await fetch(`${apiBase}/v1/marketplace/packages${q}`, { headers: await headers() })
  if (!res.ok) throw new Error(`Marketplace: ${res.status}`)
  const data = (await res.json()) as { packages: MarketplacePackage[] }
  return data.packages
}

export async function installMarketplacePackage(
  slug: string,
  organizationId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/v1/marketplace/packages/${encodeURIComponent(slug)}/install`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ organizationId }),
  })
  if (!res.ok) throw new Error(`Install: ${res.status}`)
}

export async function uninstallMarketplacePackage(
  slug: string,
  organizationId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/v1/marketplace/packages/${encodeURIComponent(slug)}/install?org_id=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE', headers: await headers() },
  )
  if (!res.ok) throw new Error(`Uninstall: ${res.status}`)
}

export { fetchMyOrgs, type FleetOrg }
