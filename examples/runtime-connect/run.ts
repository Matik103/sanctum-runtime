/**
 * Register a runtime with the Sanctum control plane and emit demo events.
 *
 *   SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com \
 *   SANCTUM_API_KEY=... \
 *   npx tsx examples/runtime-connect/run.ts
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()
const KEY = process.env.SANCTUM_API_KEY?.trim()

if (!KEY) {
  console.error('Set SANCTUM_API_KEY')
  process.exit(1)
}

const runtime = new SanctumRuntime({ baseUrl: API, apiKey: KEY })

const orgId = process.env.SANCTUM_ORG_ID ?? 'demo-org'
const name = process.env.SANCTUM_RUNTIME_NAME ?? 'demo-runtime-01'

console.log(`Connecting ${name} → ${API}\n`)

const conn = await runtime.connect({
  runtimeName: name,
  organizationId: orgId,
  mode: 'cloud',
  activeModel: process.env.SANCTUM_RISK_MODEL ?? 'gpt-4o-mini',
  metadata: { example: 'runtime-connect' },
  telemetry: { cpu: 0.12, memoryMb: 512 },
})

console.log('Connected:', conn)

await runtime.registerAgent({
  id: 'agent_demo',
  model: 'gpt-4o-mini',
  permissions: ['read', 'verify'],
})

await runtime.emitEvent('agent.started', { task: 'control-plane-demo' }, 'agent_demo')

const result = await runtime.verifyAction({
  actor: 'agent_demo',
  action: 'read_calendar',
  context: { intent: 'Phase 3 operator loop' },
  offlineMode: true,
})

console.log('\nVerify:', result.decision, result.reasoning)
await runtime.emitEvent('command.executed', { action: 'read_calendar', decision: result.decision })

console.log('\nOpen dashboard → Fleet to see runtime, agent, and events.')
await runtime.disconnect()
process.exit(0)
