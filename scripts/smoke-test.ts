/**
 * Developer smoke test — run with API up: npm run dev:runtime
 * Usage: npm run smoke
 */
import { protectAgent, AgentActions } from '../packages/adapters/agent-runtime/src/index.ts'
import { SanctumRuntime } from '../packages/sdk/src/index.ts'
import { apiRequestHeaders, resolveSanctumApiUrl } from './env.ts'

const API = resolveSanctumApiUrl()

async function fetchJson(path: string, init?: RequestInit) {
  const headers = {
    ...apiRequestHeaders(init?.body != null),
    ...(init?.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

let failed = 0
function ok(msg: string) {
  console.log(`✓ ${msg}`)
}
function fail(msg: string, err?: unknown) {
  failed++
  console.error(`✗ ${msg}`, err instanceof Error ? err.message : err ?? '')
}

async function main() {
  console.log(`Sanctum smoke test → ${API}\n`)

  try {
    const health = await fetchJson('/health')
    if (health.ok) ok('GET /health')
    else fail('GET /health', health)
  } catch (e) {
    fail('GET /health (is npm run dev:runtime running?)', e)
    process.exit(1)
  }

  try {
    const status = await fetchJson('/v1/status')
    ok(`GET /v1/status (policies=${status.policyCount}, ollama=${status.ollamaConnected})`)
  } catch (e) {
    fail('GET /v1/status', e)
  }

  try {
    const policies = await fetchJson('/v1/policies')
    ok(`GET /v1/policies (${Object.keys(policies).length} actions)`)
  } catch (e) {
    fail('GET /v1/policies', e)
  }

  try {
    const result = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'smoke-test',
        action: 'unlock_door',
        context: { time: '02:13 AM', owner_sleeping: true },
        offlineMode: true,
      }),
    })
    if (result.decision === 'REQUIRE_VERIFICATION' || result.decision === 'BLOCKED') {
      ok(`POST /v1/actions/verify → ${result.decision} (${result.risk})`)
    } else {
      fail('POST /v1/actions/verify', `expected verify/block, got ${result.decision}`)
    }
  } catch (e) {
    fail('POST /v1/actions/verify', e)
  }

  try {
    const audit = await fetchJson('/v1/audit?limit=5')
    ok(`GET /v1/audit (${Array.isArray(audit) ? audit.length : 0} entries)`)
  } catch (e) {
    fail('GET /v1/audit', e)
  }

  try {
    const runtime = new SanctumRuntime({ baseUrl: API })
    await runtime.policy('send_email', 'approve')
    ok('SanctumRuntime.policy()')
    const middleware = runtime.middleware()
    await middleware({
      action: 'send_email',
      context: { to: 'test@example.com' },
      offlineMode: true,
      execute: async () => {},
    })
    ok('SanctumRuntime.middleware()')
  } catch (e) {
    fail('SDK @sanctum-runtime/sdk', e)
  }

  try {
    const runtime = new SanctumRuntime({ baseUrl: API })
    await protectAgent(runtime, {
      actor: 'smoke-test',
      action: AgentActions.SEND_EMAIL,
      context: { to: 'test@example.com' },
      offlineMode: true,
      execute: async () => {},
    })
    ok('protectAgent() adapter')
  } catch (e) {
    fail('protectAgent() adapter', e)
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
