/**
 * Rotate SANCTUM_MEMORY_KEY for all entries on an agent.
 *
 *   SANCTUM_OLD_MEMORY_KEY=... SANCTUM_MEMORY_KEY=... \
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... \
 *   npx tsx examples/agent-memory/rotate.ts
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()
const KEY = process.env.SANCTUM_API_KEY?.trim()
const OLD = process.env.SANCTUM_OLD_MEMORY_KEY?.trim()
const NEW = process.env.SANCTUM_MEMORY_KEY?.trim()

if (!KEY || !OLD || !NEW) {
  console.error('Set SANCTUM_API_KEY, SANCTUM_OLD_MEMORY_KEY, and SANCTUM_MEMORY_KEY')
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
await runtime.connect({
  runtimeName: 'memory-rotate',
  organizationId: orgId,
  hardwareAttest: false,
})

const agentId = process.env.SANCTUM_AGENT_ID ?? 'agent_memory_demo'
const result = await runtime.rotateAgentMemoryKeys(agentId, NEW, {
  oldEncryptionKey: OLD,
})

console.log('Rotation complete:', result)
console.log('Update SANCTUM_MEMORY_KEY in your secrets to the new value.')

await runtime.disconnect()
process.exit(result.failed.length ? 1 : 0)
