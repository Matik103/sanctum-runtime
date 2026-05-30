#!/usr/bin/env node
/**
 * E2E: Connect Agent saved platform key → proxy → Live Feed audit row.
 * Usage: node scripts/test-connect-live-feed.mjs
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SANCTUM_API_URL (default https://api.sanctumruntime.com)
 * Optional: TEST_USER_EMAIL (default businessappads@gmail.com)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const API = (process.env.SANCTUM_API_URL || process.env.SANCTUM_PUBLIC_API_URL || 'https://api.sanctumruntime.com').replace(/\/$/, '')
const EMAIL = process.env.TEST_USER_EMAIL || 'businessappads@gmail.com'
const PLATFORM = process.env.TEST_PLATFORM || 'openai'

async function operatorJwt() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY required in .env')
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
  if (!userId) throw new Error('no user in session')
  const { data: mems, error: memErr } = await admin.from('organization_members').select('org_id').eq('user_id', userId)
  if (memErr) throw memErr
  const orgId = mems?.[0]?.org_id
  if (!orgId) throw new Error('no org for user')
  return { jwt: sess.session.access_token, admin, orgId }
}

async function main() {
  console.log(`API ${API}`)
  const health = await fetch(`${API}/health`).then((r) => r.json())
  console.log(`commit ${health.version?.commit}`)

  const { jwt, admin, orgId } = await operatorJwt()

  const { data: creds } = await admin.from('platform_credentials').select('platform,key_suffix').eq('org_id', orgId).eq('platform', PLATFORM)
  if (!creds?.length) throw new Error(`no saved platform credential for ${PLATFORM}`)

  const auth = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
  const agentName = `live-feed-${Date.now().toString(36)}`
  const createRes = await fetch(`${API}/v1/orgs/${orgId}/agents`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: agentName }),
  })
  if (!createRes.ok) throw new Error(`create agent ${createRes.status}: ${await createRes.text()}`)
  const agent = await createRes.json()
  const agentToken = agent.token
  if (!agentToken) throw new Error('no agent token returned')

  console.log(`agent ${agentName} (${agent.id})`)
  console.log(`platform key saved …${creds[0].key_suffix}`)

  const toolName = `connect_test_${Date.now().toString(36)}`
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Call the ${toolName} function with to="ops@acme.com" and summary="Connect Agent live feed test ${new Date().toISOString()}". You must call the tool.`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: toolName,
          description: 'Send a status email',
          parameters: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              summary: { type: 'string' },
            },
            required: ['to', 'summary'],
          },
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: toolName } },
  }

  const proxyRes = await fetch(`${API}/v1/proxy/${PLATFORM}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sanctum-Agent-Token': agentToken,
    },
    body: JSON.stringify(body),
  })
  const proxyText = await proxyRes.text()
  if (!proxyRes.ok) {
    console.error('proxy failed', proxyRes.status, proxyText.slice(0, 500))
    process.exit(1)
  }
  console.log('proxy ok', proxyRes.status)

  await new Promise((r) => setTimeout(r, 2500))

  const auditRes = await fetch(`${API}/v1/audit?limit=30`, { headers: { Authorization: `Bearer ${jwt}` } })
  const auditRaw = await auditRes.json()
  const rows = Array.isArray(auditRaw) ? auditRaw : auditRaw.entries ?? []
  const hit = rows.find(
    (e) =>
      e.context?.proxy === true &&
      e.context?.platform === PLATFORM &&
      (e.action === toolName || e.context?.tool_call_id) &&
      (e.actor === agent.id || e.context?.agent_id === agent.id),
  )

  if (!hit) {
    const proxyRows = rows.filter((e) => e.context?.proxy === true).slice(0, 5)
    console.error('Live Feed row not found. Recent proxy events:', JSON.stringify(proxyRows.map((e) => ({ action: e.action, actor: e.actor, platform: e.context?.platform, agent_name: e.context?.agent_name })), null, 2))
    process.exit(1)
  }

  console.log('Live Feed event found:')
  console.log(JSON.stringify({
    action: hit.action,
    agent: hit.context?.agent_name ?? hit.actor,
    platform: hit.context?.platform,
    decision: hit.decision,
    when: hit.timestamp ?? hit.created_at,
  }, null, 2))
  console.log('\nOK — Connect Agent + Live Feed E2E passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
