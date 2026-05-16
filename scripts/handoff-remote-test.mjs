/**
 * Handoff E2E — hosted API + optional webhook capture (webhook.site).
 * Usage:
 *   SANCTUM_API_URL=https://... SANCTUM_API_KEY=... node scripts/handoff-remote-test.mjs
 *   WEBHOOK_UUID=... (optional — poll webhook.site for deliveries from Render)
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { protectAgent, AgentActions } from '../packages/adapters/agent-runtime/src/index.ts'
import { SanctumRuntime } from '../packages/sdk/src/index.ts'

const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY = process.env.SANCTUM_API_KEY?.trim()
const WEBHOOK_UUID = process.env.WEBHOOK_UUID?.trim()

if (!API) {
  console.error('Set SANCTUM_API_URL')
  process.exit(1)
}

let failed = 0
function ok(msg) {
  console.log(`✓ ${msg}`)
}
function fail(msg, err) {
  failed++
  const detail = err instanceof Error ? err.message : err ?? ''
  console.error(`✗ ${msg}${detail ? ` — ${detail}` : ''}`)
}

function headers(json = true) {
  const h = {}
  if (json) h['Content-Type'] = 'application/json'
  if (KEY) h['X-Sanctum-Key'] = KEY
  return h
}

async function fetchJson(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(init?.body != null), ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function fetchText(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(init?.body != null), ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`)
  return text
}

async function pollWebhookEvents(expectedEvents, timeoutMs = 25_000) {
  if (!WEBHOOK_UUID) return { skipped: true, events: [] }
  const deadline = Date.now() + timeoutMs
  const found = new Set()
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://webhook.site/token/${WEBHOOK_UUID}/requests?sorting=newest&per_page=20`,
    )
    if (!res.ok) throw new Error(`webhook.site poll → ${res.status}`)
    const { data } = await res.json()
    for (const req of data ?? []) {
      try {
        const body = JSON.parse(req.content)
        if (body?.event) found.add(body.event)
      } catch {
        /* ignore */
      }
    }
    if (expectedEvents.every((e) => found.has(e))) {
      return { skipped: false, events: [...found] }
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return { skipped: false, events: [...found] }
}

async function main() {
  console.log(`Sanctum handoff test → ${API}\n`)

  // --- Core ---
  try {
    const health = await fetchJson('/health')
    if (health.ok) ok(`GET /health (policies=${health.policyCount})`)
    else fail('GET /health', health)
  } catch (e) {
    fail('GET /health', e)
    process.exit(1)
  }

  try {
    const status = await fetchJson('/v1/status')
    ok(
      `GET /v1/status (provider=${status.riskProvider}, offline=${status.systemOfflineCapable})`,
    )
  } catch (e) {
    fail('GET /v1/status', e)
  }

  try {
    const res = await fetch(`${API}/v1/status`)
    if (res.status === 401) ok('auth rejects missing X-Sanctum-Key')
    else fail('auth without key', `expected 401, got ${res.status}`)
  } catch (e) {
    fail('auth without key', e)
  }

  // --- Policies ---
  try {
    const policies = await fetchJson('/v1/policies')
    ok(`GET /v1/policies (${Object.keys(policies).length} actions)`)
  } catch (e) {
    fail('GET /v1/policies', e)
  }

  try {
    const yaml = await fetchText('/v1/policies/export.yaml')
    if (yaml.includes('policies:')) ok('GET /v1/policies/export.yaml')
    else fail('YAML export', 'missing policies key')
  } catch (e) {
    fail('GET /v1/policies/export.yaml', e)
  }

  try {
    const examplePath = resolve(process.cwd(), 'examples/policies.example.yaml')
    const exampleYaml = await readFile(examplePath, 'utf8')
    const imported = await fetchJson('/v1/policies/import.yaml', {
      method: 'POST',
      body: JSON.stringify({ yaml: exampleYaml, merge: true }),
    })
    if (imported.deploy_model?.requiresVerification) ok('POST /v1/policies/import.yaml')
    else fail('YAML import', 'deploy_model not applied')
  } catch (e) {
    fail('POST /v1/policies/import.yaml', e)
  }

  const customAction = `handoff_${Date.now()}`
  try {
    await fetchJson('/v1/policies', {
      method: 'POST',
      body: JSON.stringify({
        action: customAction,
        requiresVerification: true,
        riskPrompt: 'Handoff test policy.',
      }),
    })
    ok('POST /v1/policies (custom + riskPrompt)')
  } catch (e) {
    fail('POST /v1/policies', e)
  }

  // --- Verify paths ---
  try {
    const high = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'handoff',
        action: 'unlock_door',
        context: { time: '02:13 AM', owner_sleeping: true },
        offlineMode: true,
      }),
    })
    if (high.decision === 'REQUIRE_VERIFICATION' || high.decision === 'BLOCKED') {
      ok(`POST /v1/actions/verify high-risk → ${high.decision}`)
    } else fail('high-risk verify', high.decision)
  } catch (e) {
    fail('POST /v1/actions/verify high-risk', e)
  }

  try {
    const low = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'handoff',
        action: 'read_calendar',
        context: {},
        offlineMode: true,
      }),
    })
    if (low.decision === 'APPROVED') ok('POST /v1/actions/verify low-risk → APPROVED')
    else fail('low-risk verify', low.decision)
  } catch (e) {
    fail('POST /v1/actions/verify low-risk', e)
  }

  // --- Blocked + webhook trigger ---
  const blockAction = `handoff_block_${Date.now()}`
  let blockAuditId
  try {
    await fetchJson('/v1/policies', {
      method: 'POST',
      body: JSON.stringify({
        action: blockAction,
        requiresVerification: false,
        autoBlock: true,
      }),
    })
    const blocked = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'handoff',
        action: blockAction,
        context: {},
        offlineMode: true,
      }),
    })
    blockAuditId = blocked.id
    if (blocked.decision === 'BLOCKED') ok('POST /v1/actions/verify → BLOCKED (autoBlock)')
    else fail('autoBlock verify', blocked.decision)
  } catch (e) {
    fail('autoBlock policy + verify', e)
  }

  // --- Verification resume ---
  const correlationId = `handoff-${Date.now()}`
  let pendingId
  try {
    const pending = await fetchJson('/v1/actions/verify', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'handoff',
        action: 'unlock_door',
        context: { owner_sleeping: true },
        offlineMode: true,
        correlationId,
      }),
    })
    pendingId = pending.id
    if (pending.decision !== 'REQUIRE_VERIFICATION') {
      fail('verification flow', pending.decision)
    } else {
      const before = await fetchJson(`/v1/verifications/${correlationId}`)
      if (before.status === 'pending') ok('GET /v1/verifications → pending')
      else fail('verification pending', before.status)
      await fetchJson(`/v1/audit/${pendingId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED', resolvedBy: 'handoff' }),
      })
      const after = await fetchJson(`/v1/verifications/${correlationId}`)
      if (after.status === 'approved') ok('verification resume → approved')
      else fail('verification approved', after.status)
    }
  } catch (e) {
    fail('verification resume flow', e)
  }

  // --- Audit + org ---
  try {
    const audit = await fetchJson('/v1/audit?limit=5')
    if (Array.isArray(audit) && audit.length > 0) ok(`GET /v1/audit (${audit.length} entries)`)
    else fail('GET /v1/audit', 'empty')
  } catch (e) {
    fail('GET /v1/audit', e)
  }

  try {
    const org = await fetchJson('/v1/orgs/acme/policies')
    ok(`GET /v1/orgs/acme/policies (${Object.keys(org).length} keys)`)
  } catch (e) {
    fail('GET /v1/orgs/acme/policies', e)
  }

  // --- Webhooks status ---
  let hooksConfigured = false
  try {
    const hooks = await fetchJson('/v1/webhooks/status')
    hooksConfigured = hooks.configured
    ok(`GET /v1/webhooks/status (configured=${hooks.configured}, urls=${hooks.urlCount})`)
  } catch (e) {
    fail('GET /v1/webhooks/status', e)
  }

  // --- Webhook delivery (if WEBHOOK_UUID set and Render has webhooks configured) ---
  if (WEBHOOK_UUID && hooksConfigured) {
    console.log('\nWebhook delivery test (polling webhook.site)…')
    try {
      const corr = `handoff-hook-${Date.now()}`
      const pending = await fetchJson('/v1/actions/verify', {
        method: 'POST',
        body: JSON.stringify({
          actor: 'handoff',
          action: 'unlock_door',
          context: { owner_sleeping: true },
          offlineMode: true,
          correlationId: corr,
        }),
      })
      const poll1 = await pollWebhookEvents(['verification.required'], 20_000)
      if (poll1.events.includes('verification.required')) {
        ok('webhook verification.required received')
      } else {
        fail('webhook verification.required', `got: ${poll1.events.join(', ') || 'none'}`)
      }

      await fetchJson(`/v1/audit/${pending.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED', resolvedBy: 'handoff' }),
      })
      const poll2 = await pollWebhookEvents(
        ['verification.required', 'verification.resolved'],
        20_000,
      )
      if (poll2.events.includes('verification.resolved')) {
        ok('webhook verification.resolved received')
      } else {
        fail('webhook verification.resolved', `got: ${poll2.events.join(', ') || 'none'}`)
      }

      if (blockAuditId) {
        const poll3 = await pollWebhookEvents(
          ['verification.required', 'verification.resolved', 'action.blocked'],
          15_000,
        )
        if (poll3.events.includes('action.blocked')) {
          ok('webhook action.blocked received')
        } else {
          fail('webhook action.blocked', `got: ${poll3.events.join(', ') || 'none'}`)
        }
      }
    } catch (e) {
      fail('webhook delivery', e)
    }
  } else if (WEBHOOK_UUID && !hooksConfigured) {
    console.log(
      '\n○ Webhook delivery skipped — set SANCTUM_WEBHOOK_URL on Render and redeploy, then re-run with WEBHOOK_UUID',
    )
  }

  // --- SDK ---
  console.log('\nSDK checks…')
  try {
    const runtime = new SanctumRuntime({ baseUrl: API, apiKey: KEY })
    await runtime.registerPolicy('send_email', { requiresVerification: false })
    ok('SanctumRuntime.registerPolicy()')
    const exported = await runtime.exportPoliciesYaml()
    if (exported.includes('send_email')) ok('SanctumRuntime.exportPoliciesYaml()')
    else fail('SDK exportPoliciesYaml', 'missing send_email')
    const hookStatus = await runtime.getWebhookStatus()
    ok(`SanctumRuntime.getWebhookStatus() (configured=${hookStatus.configured})`)
  } catch (e) {
    fail('SDK client', e)
  }

  try {
    const runtime = new SanctumRuntime({ baseUrl: API, apiKey: KEY })
    const middleware = runtime.middleware()
    await middleware({
      action: 'send_email',
      context: { to: 'handoff@test.com' },
      offlineMode: true,
      execute: async () => {},
    })
    ok('SanctumRuntime.middleware()')
  } catch (e) {
    fail('SanctumRuntime.middleware()', e)
  }

  try {
    const runtime = new SanctumRuntime({ baseUrl: API, apiKey: KEY })
    await protectAgent(runtime, {
      actor: 'handoff',
      action: AgentActions.SEND_EMAIL,
      context: { to: 'handoff@test.com' },
      offlineMode: true,
      execute: async () => {},
    })
    ok('protectAgent() adapter')
  } catch (e) {
    fail('protectAgent()', e)
  }

  // --- Cleanup ---
  try {
    await fetchJson(`/v1/policies/${customAction}`, { method: 'DELETE' })
    await fetchJson(`/v1/policies/${blockAction}`, { method: 'DELETE' })
    ok('DELETE /v1/policies cleanup')
  } catch (e) {
    fail('policy cleanup', e)
  }

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll handoff checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
