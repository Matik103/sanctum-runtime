/**
 * Install a marketplace package, connect, register template agents, and run one verify.
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... \
 *   SANCTUM_PACKAGE=sanctum-agent-host|warehouse-robot|edge-sensor-gateway \
 *   npx tsx examples/marketplace-connect/run.ts
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()
const KEY = process.env.SANCTUM_API_KEY?.trim()
const PKG = process.env.SANCTUM_PACKAGE ?? 'sanctum-agent-host'

const DEMO: Record<
  string,
  { agentId: string; action: string; context: Record<string, unknown> }
> = {
  'sanctum-agent-host': {
    agentId: 'default_agent',
    action: 'send_email',
    context: {
      to: 'ops@example.com',
      subject: 'Marketplace demo',
      heard: 'Send a status email to ops.',
    },
  },
  'warehouse-robot': {
    agentId: 'navigation',
    action: 'move_robot',
    context: { zone: 'warehouse', speed: 'normal' },
  },
  'edge-sensor-gateway': {
    agentId: 'telemetry',
    action: 'disable_alarm',
    context: { zone: 'perimeter', reason: 'maintenance window' },
  },
}

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
  throw new Error('Set SANCTUM_ORG_ID or use an API key with operator context')
}

const orgId = await resolveOrgId()
const demo = DEMO[PKG]
if (!demo) {
  console.error(`Unknown SANCTUM_PACKAGE=${PKG}. Use: ${Object.keys(DEMO).join(', ')}`)
  process.exit(1)
}

console.log(`Installing ${PKG} for org ${orgId}…\n`)

const conn = await runtime.connectFromPackage(PKG, orgId)
console.log('Connected from marketplace:', conn)

const verify = await runtime.verifyAction({
  actor: demo.agentId,
  action: demo.action,
  context: { ...demo.context, org_id: orgId },
  offlineMode: true,
})

console.log(`\nVerify ${demo.action} (${demo.agentId}):`, verify.decision)

await runtime.emitEvent('marketplace.demo', { package: PKG, decision: verify.decision }, demo.agentId)
await runtime.disconnect()
console.log('\nDone — check Fleet and Policies in the dashboard.')
