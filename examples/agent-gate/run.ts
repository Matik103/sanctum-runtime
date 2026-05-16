/**
 * OSS example — gate agent actions through Sanctum before execute.
 * Prereq: npm run dev:runtime
 */
import { protectAgent, AgentActions } from '../../packages/adapters/agent-runtime/src/index.ts'
import {
  SanctumRuntime,
  SanctumActionBlockedError,
  SanctumVerificationRequiredError,
} from '@sanctum-runtime/sdk'
import { resolveSanctumApiUrl } from '../../scripts/env.ts'

const API = resolveSanctumApiUrl()

async function gate(
  label: string,
  action: string,
  context: Record<string, unknown>,
  offlineMode: boolean,
) {
  const runtime = new SanctumRuntime({ baseUrl: API })
  try {
    const { result } = await protectAgent(runtime, {
      actor: 'example-agent',
      action,
      context,
      offlineMode,
      execute: async () => ({ simulated: true }),
    })
    console.log(`✓ ${label}: ${result.decision} (${result.risk})`)
  } catch (e) {
    if (e instanceof SanctumVerificationRequiredError) {
      console.log(`⏸ ${label}: REQUIRE_VERIFICATION (${e.result.risk})`)
      console.log(`   ${e.result.reasoning.slice(0, 120)}…`)
      return
    }
    if (e instanceof SanctumActionBlockedError) {
      console.log(`✗ ${label}: BLOCKED (${e.result.risk})`)
      return
    }
    throw e
  }
}

async function main() {
  console.log(`Sanctum agent-gate example → ${API}\n`)

  try {
    const res = await fetch(`${API}/health`)
    if (!res.ok) throw new Error(`health ${res.status}`)
  } catch {
    console.error('API not reachable. Start: npm run dev:runtime')
    process.exit(1)
  }

  await gate('Low-risk email (offline)', AgentActions.SEND_EMAIL, { to: 'user@example.com' }, true)
  await gate('Night unlock (offline)', 'unlock_door', { time: '02:13 AM', owner_sleeping: true }, true)

  console.log('\nDone. See OPEN_CORE.md for OSS vs enterprise boundaries.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
