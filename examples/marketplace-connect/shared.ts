import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

export const API = resolveSanctumApiUrl()

export type PackageDemo = {
  slug: string
  agentId: string
  action: string
  context: Record<string, unknown>
}

export async function resolveOrgId(apiKey: string): Promise<string> {
  if (process.env.SANCTUM_ORG_ID?.trim()) return process.env.SANCTUM_ORG_ID.trim()
  const res = await fetch(`${API}/v1/operator/context`, {
    headers: { 'X-Sanctum-Key': apiKey },
  })
  if (res.ok) {
    const ctx = (await res.json()) as { defaultOrganizationId?: string | null }
    if (ctx.defaultOrganizationId) return ctx.defaultOrganizationId
  }
  throw new Error('Set SANCTUM_ORG_ID or use an API key with operator context')
}

export async function runPackageDemo(demo: PackageDemo, apiKey: string) {
  const runtime = new SanctumRuntime({ baseUrl: API, apiKey })
  const orgId = await resolveOrgId(apiKey)

  console.log(`Installing ${demo.slug} for org ${orgId}…\n`)

  const conn = await runtime.connectFromPackage(demo.slug, orgId)
  console.log('Connected:', conn)

  const verify = await runtime.verifyAction({
    actor: demo.agentId,
    action: demo.action,
    context: { ...demo.context, org_id: orgId },
    offlineMode: true,
  })

  console.log(`\nVerify ${demo.action} (${demo.agentId}):`, verify.decision)

  await runtime.emitEvent(
    'marketplace.demo',
    { package: demo.slug, decision: verify.decision },
    demo.agentId,
  )
  await runtime.disconnect()
  console.log('\nDone — check Fleet, Policies, and Audit in the dashboard.')
}
