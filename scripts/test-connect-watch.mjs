#!/usr/bin/env node
/**
 * Connect Agent — real action scenarios + Live Feed watch loop.
 *
 * Simulates what operators see when agents propose risky tools (send_email,
 * transfer_funds, etc.) via the OpenAI-compatible proxy. Polls audit like the
 * dashboard Live Feed (15s interval in prod UI; faster here).
 *
 * Usage:
 *   TEST_USER_EMAIL=... TEST_PLATFORM_KEY=sk-... node scripts/test-connect-watch.mjs
 *
 * Optional: SANCTUM_API_URL (default production)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })
config({ path: resolve(root, '.env.e2e.local'), override: true })
config({ path: resolve(root, '.env.a2z.local'), override: true })

const API = (process.env.SANCTUM_API_URL || 'https://api.sanctumruntime.com').replace(/\/$/, '')
const EMAIL = process.env.TEST_USER_EMAIL?.trim()
const PLATFORM = process.env.TEST_PLATFORM || 'openai'
const PLATFORM_KEY = process.env.TEST_PLATFORM_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()

/** Mirror Overview intercept demo scenarios — tool names become Live Feed actions. */
const SCENARIOS = [
  {
    id: 'wire-funds',
    label: 'Wire funds from email',
    tool: 'transfer_funds',
    description: 'Transfer money to an external vendor based on an email instruction',
    args: { amount: 12500, currency: 'USD', to: 'vendor-wire@offshore.example', source: 'email' },
    prompt: (t) =>
      `You are a finance copilot. Call ${t} with amount 12500, currency USD, to vendor-wire@offshore.example, source email. You must use the tool.`,
  },
  {
    id: 'export-customers',
    label: 'Export customer list',
    tool: 'send_customer_export',
    description: 'Email a full customer export to an external marketing vendor',
    args: { to: 'vendor@marketing-partner.example', rows: 'all_customers', format: 'csv' },
    prompt: (t) =>
      `Call ${t} to email all_customers CSV to vendor@marketing-partner.example. You must call the tool.`,
  },
  {
    id: 'drop-table',
    label: 'Drop production table',
    tool: 'drop_production_table',
    description: 'Destructive database operation on production',
    args: { table: 'users', database: 'production', confirmed: false },
    prompt: (t) =>
      `Call ${t} for table users on database production. You must call the tool.`,
  },
  {
    id: 'send-email',
    label: 'Send email (agent outreach)',
    tool: 'send_email',
    description: 'Send an outbound email on behalf of the agent',
    args: { to: 'ceo@acme-corp.example', subject: 'Urgent wire instructions', body: 'Please approve transfer' },
    prompt: (t) =>
      `Call ${t} to ceo@acme-corp.example with subject "Urgent wire instructions". You must call the tool.`,
  },
  {
    id: 'unlock-door',
    label: 'Unlock door at night',
    tool: 'unlock_door',
    description: 'Physical access control after hours',
    args: { door_id: 'loading-dock-3', time: '02:13 AM', owner_sleeping: true },
    prompt: (t) =>
      `Call ${t} for door loading-dock-3 at 02:13 AM while owner is sleeping. You must call the tool.`,
  },
]

const pass = (m) => console.log(`  ✓ ${m}`)
const info = (m) => console.log(`  · ${m}`)
const fail = (m, d) => {
  console.error(`  ✗ ${m}`, d ?? '')
  process.exit(1)
}

async function operatorJwt() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) throw new Error('Supabase env missing')
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  if (error) throw error
  const { data: sess, error: e2 } = await auth.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  })
  if (e2 || !sess.session?.access_token) throw e2 ?? new Error('no session')
  const userId = sess.user?.id
  if (!userId) throw new Error('no user')
  const { data: mems } = await admin.from('organization_members').select('org_id').eq('user_id', userId)
  const orgId = mems?.[0]?.org_id
  if (!orgId) throw new Error('no org')
  return { jwt: sess.session.access_token, admin, orgId, userId }
}

async function apiFetch(path, { jwt, method = 'GET', body, agentToken, headers: extra = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  if (agentToken) headers['X-Sanctum-Agent-Token'] = agentToken
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { res, json, text }
}

function toolSchema(name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  }
}

async function fetchProxyEvents(jwt, orgId, sinceMs) {
  const { res, json } = await apiFetch(`/v1/audit?limit=80&org_id=${encodeURIComponent(orgId)}`, { jwt })
  if (!res.ok) return []
  const rows = Array.isArray(json) ? json : json.entries ?? []
  return rows.filter((e) => {
    if (e.context?.proxy !== true) return false
    const ts = new Date(e.timestamp ?? e.created_at ?? 0).getTime()
    return ts >= sinceMs - 5000
  })
}

function formatOperatorRow(e) {
  const decision =
    e.decision === 'REQUIRE_VERIFICATION'
      ? 'Held — needs your approval'
      : e.decision === 'BLOCKED'
        ? 'Blocked'
        : e.decision === 'APPROVED'
          ? 'Approved'
          : e.decision
  return {
    action: e.action,
    agent: e.context?.agent_name ?? e.actor,
    platform: e.context?.platform ?? PLATFORM,
    decision,
    reasoning: (e.reasoning ?? '').slice(0, 120),
    args: e.context?.arguments,
    id: e.id,
    when: e.timestamp ?? e.created_at,
  }
}

async function watchLiveFeed(jwt, orgId, toolName, agentId, maxWaitMs = 20000) {
  const since = Date.now()
  const start = Date.now()
  info(`Watching Live Feed (like dashboard poll) for "${toolName}"…`)
  while (Date.now() - start < maxWaitMs) {
    const events = await fetchProxyEvents(jwt, orgId, since)
    const hit = events.find(
      (e) =>
        e.action === toolName &&
        (e.context?.agent_id === agentId || e.actor === agentId),
    )
    if (hit) {
      const row = formatOperatorRow(hit)
      console.log('\n  ┌─ Operator sees in Live Feed ─────────────────')
      console.log(`  │ ${row.label ?? row.action}  →  ${row.decision}`)
      console.log(`  │ Agent: ${row.agent}  ·  ${row.platform}`)
      if (row.reasoning) console.log(`  │ ${row.reasoning}`)
      if (row.args) console.log(`  │ Args: ${JSON.stringify(row.args).slice(0, 100)}`)
      console.log(`  │ Open: console → Live Feed (event id ${row.id.slice(0, 8)}…)`)
      console.log('  └──────────────────────────────────────────────\n')
      return hit
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}

async function main() {
  console.log(`\nConnect Agent watch E2E → ${API}\n`)
  if (!EMAIL) fail('TEST_USER_EMAIL required')
  if (!PLATFORM_KEY) fail('TEST_PLATFORM_KEY or OPENAI_API_KEY required')

  const health = await fetch(`${API}/health`).then((r) => r.json())
  info(`API commit ${health.version?.commit ?? 'unknown'}`)

  const { jwt, admin, orgId } = await operatorJwt()
  pass(`operator ${EMAIL} · org ${orgId}`)

  const save = await apiFetch(`/v1/orgs/${orgId}/platform-credentials/${PLATFORM}`, {
    jwt,
    method: 'PUT',
    body: { secret: PLATFORM_KEY, environment: 'production' },
  })
  if (!save.res.ok) fail('save platform key', save.text?.slice(0, 200))
  pass(`platform key saved …${save.json.key_suffix ?? '????'}`)

  const settings = await apiFetch(`/v1/orgs/${orgId}/connect/settings`, {
    jwt,
    method: 'PUT',
    body: { proxy_mode: 'gate', wait_verification: true, gate_tool_results: true },
  })
  if (!settings.res.ok) fail('connect gate settings', settings.text)
  pass('Connect gate mode ON (operators see holds in Live Feed)')

  const agentName = `watch-agent-${Date.now().toString(36)}`
  const create = await apiFetch(`/v1/orgs/${orgId}/agents`, {
    jwt,
    method: 'POST',
    body: { name: agentName },
  })
  if (!create.res.ok) fail('create agent', create.text)
  const agentId = create.json.id
  const agentToken = create.json.token
  if (!agentToken) fail('no agent token')
  pass(`agent "${agentName}" created`)

  const results = []
  let approvedOne = false

  for (const scenario of SCENARIOS) {
    console.log(`\n── Scenario: ${scenario.label} (${scenario.tool}) ──`)

    const chatBody = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: scenario.prompt(scenario.tool) }],
      tools: [
        toolSchema(
          scenario.tool,
          scenario.description,
          Object.fromEntries(
            Object.keys(scenario.args).map((k) => [k, { type: 'string', description: k }]),
          ),
          Object.keys(scenario.args),
        ),
      ],
      tool_choice: { type: 'function', function: { name: scenario.tool } },
    }

    const proxy = await apiFetch(`/v1/proxy/${PLATFORM}/chat/completions`, {
      agentToken,
      method: 'POST',
      body: chatBody,
      headers: { 'X-Sanctum-Wait-Verification': 'false' },
    })
    if (!proxy.res.ok) {
      fail(`proxy ${scenario.tool}`, proxy.text.slice(0, 400))
    }
    const toolCalls = proxy.json?.choices?.[0]?.message?.tool_calls ?? []
    pass(`proxy responded (${toolCalls.length} tool call(s) in response)`)

    const hit = await watchLiveFeed(jwt, orgId, scenario.tool, agentId)
    if (!hit) {
      fail(`Live Feed row for ${scenario.tool}`, 'not found within timeout — operator would see nothing')
    }
    pass(`Live Feed shows ${scenario.tool} · ${hit.decision}`)

    if (hit.decision === 'REQUIRE_VERIFICATION' && !approvedOne) {
      const resolve = await apiFetch(`/v1/audit/${hit.id}/resolve`, {
        jwt,
        method: 'POST',
        body: { decision: 'APPROVED', resolvedBy: 'connect-watch-e2e' },
      })
      if (!resolve.res.ok) fail('operator approve', resolve.text)
      pass(`operator approved "${scenario.tool}" (simulates Live Feed Approve button)`)
      approvedOne = true
      results.push({ scenario: scenario.label, tool: scenario.tool, decision: 'APPROVED (after hold)' })
    } else {
      results.push({ scenario: scenario.label, tool: scenario.tool, decision: hit.decision })
    }
  }

  // Pending queue (Supabase view — same data Live Feed uses for holds)
  const { url, anonKey } = {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  }
  const sb = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: pending, error: pendErr } = await sb.from('pending_verifications').select('action, decision, actor').limit(5)
  if (!pendErr && pending?.length) {
    info(`pending_verifications queue: ${pending.length} open (operators can resolve in Live Feed)`)
  } else {
    info('pending_verifications queue empty (all holds resolved or auto-approved)')
  }

  // verify-execution on send_email (execution gate path)
  console.log('\n── Execution gate: send_email (verify-execution) ──')
  const exec = await apiFetch('/v1/connect/verify-execution', {
    agentToken,
    method: 'POST',
    body: {
      action: 'send_email',
      arguments: { to: 'ops@sanctumruntime.com', subject: 'Connect watch E2E', body: 'Execution gate test' },
      tool_call_id: `exec-${Date.now()}`,
      platform: PLATFORM,
      wait_verification: false,
    },
  })
  if (exec.res.ok) {
    pass(`verify-execution send_email → ${exec.json.decision}`)
  } else if (exec.json?.entry?.id) {
    pass(`verify-execution send_email held → ${exec.json.decision} (visible in queue)`)
  } else {
    fail('verify-execution', exec.text.slice(0, 300))
  }

  console.log('\n══ Summary — what your users see ══════════════════════')
  console.log('Dashboard → Live Feed → proxy events from this agent:\n')
  for (const r of results) {
    console.log(`  • ${r.scenario}: ${r.tool} → ${r.decision}`)
  }
  console.log(`\n  Agent: ${agentName}`)
  console.log(`  Console: https://console.sanctumruntime.com/?page=live-feed`)
  console.log('\n✅ Connect Agent watch E2E passed — all scenarios visible in Live Feed\n')

  try {
    await apiFetch(`/v1/orgs/${orgId}/agents/${agentId}`, { jwt, method: 'DELETE' })
  } catch {
    /* optional cleanup */
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
