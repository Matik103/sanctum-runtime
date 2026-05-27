/**
 * Developer smoke test — run with API up: npm run dev:runtime
 * Usage: npm run smoke
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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

async function fetchText(path: string, init?: RequestInit) {
  const headers = {
    ...apiRequestHeaders(init?.body != null),
    ...(init?.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.text()
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

  let status: {
    policyCount?: number
    ollamaConnected?: boolean
    riskModelConnected?: boolean
    riskProvider?: string
    riskModel?: string
  } = {}

  try {
    status = await fetchJson('/v1/status')
    const modelUp = status.riskModelConnected ?? status.ollamaConnected
    ok(
      `GET /v1/status (policies=${status.policyCount}, provider=${status.riskProvider ?? 'ollama'}, model=${status.riskModel ?? status.ollamaModel ?? '—'}, connected=${modelUp})`,
    )
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
    const yaml = await fetchText('/v1/policies/export.yaml')
    if (!yaml.includes('policies:')) fail('YAML export', 'missing policies key')
    else ok('GET /v1/policies/export.yaml')

    const examplePath = resolve(process.cwd(), 'examples/policies.example.yaml')
    const exampleYaml = await readFile(examplePath, 'utf8')
    const imported = await fetchJson('/v1/policies/import.yaml', {
      method: 'POST',
      body: JSON.stringify({ yaml: exampleYaml, merge: true }),
    })
    if (imported.deploy_model?.requiresVerification) {
      ok('POST /v1/policies/import.yaml (example policies)')
    } else {
      fail('YAML import', 'deploy_model policy not applied')
    }
  } catch (e) {
    fail('policy YAML import/export', e)
  }

  try {
    await fetchJson('/v1/policies', {
      method: 'POST',
      body: JSON.stringify({
        action: 'smoke_custom_action',
        requiresVerification: true,
        riskPrompt: 'Smoke test: treat all requests as medium risk unless context says test.',
      }),
    })
    ok('POST /v1/policies with riskPrompt')
  } catch (e) {
    fail('custom riskPrompt policy', e)
  }

  try {
    const hooks = await fetchJson('/v1/webhooks/status')
    ok(`GET /v1/webhooks/status (configured=${hooks.configured})`)
  } catch (e) {
    fail('GET /v1/webhooks/status', e)
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
      ok(`POST /v1/actions/verify (offline) → ${result.decision} (${result.risk})`)
    } else {
      fail('POST /v1/actions/verify', `expected verify/block, got ${result.decision}`)
    }
  } catch (e) {
    fail('POST /v1/actions/verify', e)
  }

  const modelUp = status.riskModelConnected ?? status.ollamaConnected
  if (modelUp) {
    try {
      const online = await fetchJson('/v1/actions/verify', {
        method: 'POST',
        body: JSON.stringify({
          actor: 'smoke-test',
          action: 'unlock_door',
          context: { time: '02:13 AM', owner_sleeping: true },
          offlineMode: false,
        }),
      })
      ok(
        `POST /v1/actions/verify (local model) → ${online.decision} (${online.risk}, modelInvoked=${online.modelInvoked})`,
      )
    } catch (e) {
      fail('local model verify', e)
    }
  } else {
    console.log('○ local model verify skipped (risk model not connected — start Ollama)')
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
    const exported = await runtime.exportPoliciesYaml()
    if (exported.includes('send_email')) ok('SanctumRuntime.exportPoliciesYaml()')
    else fail('SDK exportPoliciesYaml', 'missing send_email')
  } catch (e) {
    fail('SDK @sanctum-runtime/sdk', e)
  }

  try {
    // Use smoke_custom_action (REQUIRE_VERIFICATION policy set above) with a low-risk
    // context so Shield doesn't elevate the score to BLOCK. Use a unique actor per run
    // to avoid "Repeated Blocked Attempts" from earlier steps.
    const resumeActor = `smoke-rv-${Date.now()}`
    const correlationId = `smoke-${Date.now()}`
    const pending = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: resumeActor,
        action: 'smoke_custom_action',
        context: { source: 'smoke-test', environment: 'ci' },
        offlineMode: true,
        correlationId,
      }),
    })
    if (pending.decision !== 'REQUIRE_VERIFICATION') {
      fail('verification resume', `expected REQUIRE_VERIFICATION, got ${pending.decision}`)
    } else {
      const before = await fetchJson(`/v1/verifications/${correlationId}`)
      if (before.status !== 'pending') fail('GET /v1/verifications', before)
      else ok('GET /v1/verifications → pending')
      await fetchJson(`/v1/audit/${pending.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED', resolvedBy: 'smoke-test' }),
      })
      const after = await fetchJson(`/v1/verifications/${correlationId}`)
      if (after.status === 'approved') ok('verification resume → approved after resolve')
      else fail('verification resume', after)
    }
  } catch (e) {
    fail('verification resume flow', e)
  }

  try {
    const runtime = new SanctumRuntime({ baseUrl: API })
    // Use a unique actor so prior blocked attempts don't trigger Shield containment here.
    await protectAgent(runtime, {
      actor: `smoke-pa-${Date.now()}`,
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
