/**
 * Install a marketplace package and connect in one call.
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... \
 *   npx tsx examples/marketplace-connect/run.ts
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()
const KEY = process.env.SANCTUM_API_KEY?.trim()
const PKG = process.env.SANCTUM_PACKAGE ?? 'sanctum-agent-host'

if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

const runtime = new SanctumRuntime({ baseUrl: API, apiKey: KEY })

async function resolveOrgId(): Promise<string> {
  if (process.env.SANCTUM_ORG_ID?.trim()) return process.env.SANCTUM_ORG_ID.trim()
  const res = await fetch(`${API}/v1/operator/context`, {
    headers: { 'X-Sanctum-Key': KEY! },
  })
  if (res.ok) {
    const ctx = (await res.json()) as { defaultOrganizationId?: string | null }
    if (ctx.defaultOrganizationId) return ctx.defaultOrganizationId
  }
  return 'demo-org'
}

const orgId = await resolveOrgId()
console.log(`Installing ${PKG} for org ${orgId}…\n`)

const conn = await runtime.connectFromPackage(PKG, orgId)
console.log('Connected from marketplace:', conn)

await runtime.emitEvent('marketplace.demo', { package: PKG }, 'default_agent')
await runtime.disconnect()
process.exit(0)
