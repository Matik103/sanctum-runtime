/**
 * Encrypted agent memory demo.
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... SANCTUM_MEMORY_KEY=... \
 *   npx tsx examples/agent-memory/run.ts
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()
const KEY = process.env.SANCTUM_API_KEY?.trim()
if (!KEY || !process.env.SANCTUM_MEMORY_KEY?.trim()) {
  console.error('Set SANCTUM_API_KEY and SANCTUM_MEMORY_KEY (≥16 chars)')
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
  runtimeName: process.env.SANCTUM_RUNTIME_NAME ?? 'memory-demo',
  organizationId: orgId,
  region: 'local',
})

const agentId = 'agent_memory_demo'
await runtime.registerAgent({ id: agentId, model: 'gpt-4o-mini' })

const mem = runtime.memory(agentId)
await mem.set('session', { turn: 1, facts: ['user prefers dark mode'] })
console.log('Stored encrypted session memory, keyHint:', mem.keyHint)

const loaded = await mem.get<{ turn: number; facts: string[] }>('session')
console.log('Loaded:', loaded)

console.log('Keys:', await mem.list())
await runtime.emitEvent('memory.demo', { key: 'session' }, agentId)
await runtime.disconnect()
process.exit(0)
