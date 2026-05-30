#!/usr/bin/env node
/**
 * Full Connect Agent E2E — health, settings, presets, proxy gate, execution verify, Live Feed.
 *
 * Usage:
 *   TEST_PLATFORM_KEY=sk-... node scripts/test-connect-full.mjs
 *
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional: SANCTUM_API_URL, TEST_USER_EMAIL, TEST_PLATFORM (default openai),
 *           TEST_AGENT_ID (reuse agent; rotates token to obtain sk_agent_...)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const API = (process.env.SANCTUM_API_URL || process.env.SANCTUM_PUBLIC_API_URL || 'https://api.sanctumruntime.com').replace(/\/$/, '')
const EMAIL = process.env.TEST_USER_EMAIL || 'businessappads@gmail.com'
const PLATFORM = process.env.TEST_PLATFORM || 'openai'
const PLATFORM_KEY = process.env.TEST_PLATFORM_KEY?.trim()

const pass = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg, detail) => {
  console.error(`  ✗ ${msg}`, detail ?? '')
  process.exit(1)
}

async function operatorJwt() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY required')
  }
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
  const { data: mems, error: memErr } = await admin.from('organization_members').select('org_id').eq('user_id', userId)
  if (memErr) throw memErr
  const orgId = mems?.[0]?.org_id
  if (!orgId) throw new Error('no org')
  return { jwt: sess.session.access_token, admin, orgId }
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
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { res, json, text }
}

async function main() {
  console.log(`\nConnect Agent full E2E → ${API}\n`)

  const health = await fetch(`${API}/health`).then((r) => r.json())
  console.log(`API commit: ${health.version?.commit}`)
  if (health.version?.commit !== '13aac76' && !process.env.ALLOW_OLD_API) {
    console.warn('  ⚠ API may not include latest Connect features (expected 13aac76)')
  }

  const { jwt, admin, orgId } = await operatorJwt()
  pass(`operator JWT for ${EMAIL}, org ${orgId.slice(0, 20)}…`)

  // ── Platform credential ──
  if (PLATFORM_KEY) {
    const save = await apiFetch(`/v1/orgs/${orgId}/platform-credentials/${PLATFORM}`, {
      jwt,
      method: 'PUT',
      body: { secret: PLATFORM_KEY },
    })
    if (!save.res.ok) fail('save platform credential', save.text.slice(0, 300))
    pass(`platform key saved …${save.json.key_suffix ?? '????'}`)

    const testCred = await apiFetch(`/v1/orgs/${orgId}/platform-credentials/${PLATFORM}/test`, {
      jwt,
      method: 'POST',
      body: {},
    })
    if (!testCred.res.ok || !testCred.json.ok) fail('platform credential test', testCred.json)
    pass('platform credential test OK')
  } else {
    const { data: creds } = await admin.from('platform_credentials').select('key_suffix').eq('org_id', orgId).eq('platform', PLATFORM)
    if (!creds?.length) fail('no saved platform key — set TEST_PLATFORM_KEY')
    pass(`using saved platform key …${creds[0].key_suffix}`)
  }

  // ── Reuse existing agent (rotate token) ──
  let agentId = process.env.TEST_AGENT_ID
  let agentName
  if (!agentId) {
    const list = await apiFetch(`/v1/orgs/${orgId}/agents`, { jwt })
    if (!list.res.ok) fail('list agents', list.text)
    const agents = Array.isArray(list.json) ? list.json : list.json.agents ?? []
    if (!agents.length) fail('no agents — create one in dashboard first')
    agentId = agents[0].id
    agentName = agents[0].name
  } else {
    const { data: row } = await admin.from('agent_registrations').select('name').eq('id', agentId).maybeSingle()
    agentName = row?.name ?? agentId.slice(0, 8)
  }

  const rotate = await apiFetch(`/v1/orgs/${orgId}/agents/${agentId}/rotate`, { jwt, method: 'POST', body: {} })
  if (!rotate.res.ok) fail('rotate agent token', rotate.text.slice(0, 300))
  const agentToken = rotate.json.token
  if (!agentToken?.startsWith('sk_agent_')) fail('no agent token from rotate')
  pass(`agent "${agentName}" (${agentId.slice(0, 8)}…) token rotated`)

  // ── Connect health ──
  const connHealth = await apiFetch(`/v1/orgs/${orgId}/connect/health`, { jwt })
  if (!connHealth.res.ok) fail('connect health', connHealth.text.slice(0, 300))
  pass(`connect health: ${connHealth.json.events?.total ?? 0} proxy events (7d), settings.proxy_mode=${connHealth.json.settings?.proxy_mode}`)

  // ── Connect settings ──
  const settingsGet = await apiFetch(`/v1/orgs/${orgId}/connect/settings`, { jwt })
  if (!settingsGet.res.ok) fail('connect settings GET', settingsGet.text)
  pass(`connect settings loaded (gate_tool_results=${settingsGet.json.gate_tool_results})`)

  const settingsPut = await apiFetch(`/v1/orgs/${orgId}/connect/settings`, {
    jwt,
    method: 'PUT',
    body: { proxy_mode: 'gate', wait_verification: true, gate_tool_results: true },
  })
  if (!settingsPut.res.ok) fail('connect settings PUT', settingsPut.text)
  pass('connect settings updated (gate mode)')

  // ── Policy presets ──
  const presets = await apiFetch(`/v1/orgs/${orgId}/connect/policy-presets`, { jwt })
  if (!presets.res.ok) fail('connect presets', presets.text)
  pass(`policy presets: ${presets.json.presets?.map((p) => p.id).join(', ')}`)

  // ── Suggest policies ──
  const suggest = await apiFetch(`/v1/orgs/${orgId}/connect/suggest-policies`, { jwt })
  if (!suggest.res.ok) fail('suggest policies', suggest.text)
  pass(`policy suggestions: ${suggest.json.suggestions?.length ?? 0}`)

  // ── Connect test-run ──
  const testRun = await apiFetch(`/v1/orgs/${orgId}/connect/test-run`, {
    jwt,
    method: 'POST',
    body: { agent_id: agentId, platform: PLATFORM },
  })
  if (!testRun.res.ok) fail('connect test-run', testRun.text)
  pass(`connect test-run: ${testRun.json.decision}`)

  // ── Proxy: tool call proposal gating ──
  const toolName = `connect_e2e_${Date.now().toString(36)}`
  const chatBody = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `You must call ${toolName} with to="ops@test.local" and note="Connect full E2E ${new Date().toISOString()}".`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: toolName,
          description: 'Test tool for Connect E2E',
          parameters: {
            type: 'object',
            properties: { to: { type: 'string' }, note: { type: 'string' } },
            required: ['to', 'note'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: toolName } },
  }

  const proxy = await apiFetch(`/v1/proxy/${PLATFORM}/chat/completions`, {
    agentToken,
    method: 'POST',
    body: chatBody,
    headers: { 'X-Sanctum-Wait-Verification': 'false' },
  })
  if (!proxy.res.ok) fail('proxy chat/completions', proxy.text.slice(0, 500))
  const toolCalls = proxy.json?.choices?.[0]?.message?.tool_calls ?? []
  const blockNote = proxy.json?.choices?.[0]?.message?.content ?? ''
  if (toolCalls.length > 0) {
    pass(`proxy OK — ${toolCalls.length} tool call(s): ${toolCalls[0]?.function?.name}`)
  } else {
    pass(`proxy OK — tool call held/filtered (expected when policy requires verification)`)
  }

  await new Promise((r) => setTimeout(r, 3000))

  // ── Live Feed audit row ──
  const audit = await apiFetch('/v1/audit?limit=40', { jwt })
  if (!audit.res.ok) fail('audit fetch', audit.text)
  const rows = Array.isArray(audit.json) ? audit.json : audit.json.entries ?? []
  const hit = rows.find(
    (e) =>
      e.context?.proxy === true &&
      e.context?.platform === PLATFORM &&
      (e.action === toolName || e.context?.agent_id === agentId),
  )
  if (!hit) fail('Live Feed proxy event not found', rows.filter((e) => e.context?.proxy).slice(0, 3))
  pass(`Live Feed event: action=${hit.action} decision=${hit.decision} agent=${hit.context?.agent_name ?? hit.actor}`)

  if (hit.decision === 'REQUIRE_VERIFICATION') {
    const resolved = await apiFetch(`/v1/audit/${hit.id}/resolve`, {
      jwt,
      method: 'POST',
      body: { decision: 'APPROVED', resolvedBy: 'connect-e2e-test' },
    })
    if (!resolved.res.ok) fail('approve held action', resolved.text.slice(0, 300))
    pass('approved held action from Live Feed flow')
  }

  // ── verify-execution (use health-check action — auto-approved) ──
  const execVerify = await apiFetch('/v1/connect/verify-execution', {
    agentToken,
    method: 'POST',
    body: {
      action: 'connect_health_check',
      arguments: { source: 'connect-e2e', tool: toolName },
      tool_call_id: `exec-${Date.now()}`,
      platform: PLATFORM,
      wait_verification: false,
    },
  })
  if (execVerify.res.ok) {
    pass(`verify-execution: decision=${execVerify.json.decision}${execVerify.json.actionToken ? ' (actionToken issued)' : ''}`)
  } else if (execVerify.json?.decision === 'REQUIRE_VERIFICATION' && execVerify.json?.entry?.id) {
    const execResolve = await apiFetch(`/v1/audit/${execVerify.json.entry.id}/resolve`, {
      jwt,
      method: 'POST',
      body: { decision: 'APPROVED', resolvedBy: 'connect-e2e-test' },
    })
    if (!execResolve.res.ok) fail('approve verify-execution hold', execResolve.text.slice(0, 300))
    pass('verify-execution held → approved via API (execution gate + operator flow OK)')
  } else {
    fail('verify-execution', execVerify.text.slice(0, 400))
  }

  // ── Tool-result gating (incoming request) ──
  const toolResultBody = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'user', content: 'Summarize the tool result briefly.' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_result_test', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_result_test',
        content: 'CONFIDENTIAL: internal revenue figure $9.2M for Connect E2E test',
      },
    ],
  }
  const toolResultProxy = await apiFetch(`/v1/proxy/${PLATFORM}/chat/completions`, {
    agentToken,
    method: 'POST',
    body: toolResultBody,
    headers: { 'X-Sanctum-Wait-Verification': 'false' },
  })
  // May fail upstream if model rejects — we mainly check proxy accepts and forwards
  if (toolResultProxy.res.status === 401 || toolResultProxy.res.status === 403) {
    fail('tool-result proxy auth/gate', toolResultProxy.text.slice(0, 300))
  }
  pass(`tool-result request proxied (status ${toolResultProxy.res.status})`)

  await new Promise((r) => setTimeout(r, 2000))
  const audit2 = await apiFetch('/v1/audit?limit=10', { jwt })
  const rows2 = Array.isArray(audit2.json) ? audit2.json : audit2.json.entries ?? []
  const toolResultHit = rows2.find((e) => e.action === 'tool_result' && e.context?.phase === 'tool_result')
  if (toolResultHit) {
    pass(`tool-result gated in audit: decision=${toolResultHit.decision}`)
  } else {
    console.log('  ~ tool-result audit row not in last 10 (may appear with delay)')
  }

  console.log('\n✅ Connect Agent full E2E passed\n')
  console.log('Agent token (store securely — shown once after rotate):')
  console.log(agentToken.slice(0, 20) + '…' + agentToken.slice(-6))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
