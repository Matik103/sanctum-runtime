#!/usr/bin/env node
/**
 * Prepare E2E credentials: sk_sanctum API key + sync platform credential to prod + local.
 *
 *   node scripts/e2e-bootstrap.mjs
 *   TEST_PLATFORM_KEY=sk-... node scripts/e2e-bootstrap.mjs  # when DB ciphertext cannot be decrypted locally
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { decryptSecret, getEncryptionKey } from '../apps/api/src/crypto-utils.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const PROD = 'https://api.sanctumruntime.com'
const LOCAL = `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`
const EMAIL = process.env.TEST_USER_EMAIL || 'businessappads@gmail.com'
const OUT = resolve(root, '.env.e2e.local')

async function operatorJwt() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !serviceKey || !anonKey) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY required')
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
  return { jwt: sess.session.access_token, admin, orgId, userId }
}

async function resolvePlatformSecret(admin, orgId, jwt) {
  const fromEnv = process.env.TEST_PLATFORM_KEY?.trim()
  if (fromEnv) return fromEnv

  const reveal = await fetch(
    `${PROD}/v1/orgs/${orgId}/platform-credentials/openai/bootstrap-secret`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  )
  if (reveal.ok) {
    const body = await reveal.json()
    if (body.secret) return body.secret
  }

  const { data } = await admin
    .from('platform_credentials')
    .select('secret_enc')
    .eq('org_id', orgId)
    .eq('platform', 'openai')
    .eq('environment', 'production')
    .maybeSingle()

  if (data?.secret_enc) {
    try {
      return await decryptSecret(data.secret_enc, getEncryptionKey())
    } catch {
      // ciphertext may use production SSO_ENCRYPTION_KEY
    }
  }

  const prodTest = await fetch(`${PROD}/v1/orgs/${orgId}/platform-credentials/openai/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_secret: true }),
  })
  if (prodTest.ok) {
    const body = await prodTest.json()
    if (body.ok && body.secret) return body.secret
  }

  const prodVerify = await fetch(`${PROD}/v1/orgs/${orgId}/platform-credentials/openai/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (prodVerify.ok && (await prodVerify.json()).ok) return null

  throw new Error('No platform credential configured. Set TEST_PLATFORM_KEY=sk-... and re-run bootstrap.')
}

async function savePlatformKey(api, jwt, orgId, secret) {
  const res = await fetch(`${api}/v1/orgs/${orgId}/platform-credentials/openai`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, environment: 'production' }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${api} save platform key → ${res.status} ${text.slice(0, 200)}`)
}

async function testPlatformKey(api, jwt, orgId) {
  const res = await fetch(`${api}/v1/orgs/${orgId}/platform-credentials/openai/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(`${api} platform test failed → ${res.status} ${JSON.stringify(body)}`)
}

async function createDashboardKey(api, jwt, orgId) {
  const res = await fetch(`${api}/v1/api-keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `e2e-${Date.now().toString(36)}`, org_id: orgId }),
  })
  const body = await res.json()
  if (!res.ok || !body.secret?.startsWith('sk_sanctum_')) {
    throw new Error(`create api key failed → ${res.status} ${JSON.stringify(body)}`)
  }
  return body.secret
}

async function main() {
  console.log('E2E bootstrap\n')
  const { jwt, admin, orgId } = await operatorJwt()
  console.log(`org ${orgId}`)

  const platformSecret = await resolvePlatformSecret(admin, orgId, jwt)
  if (platformSecret) {
    console.log(`platform key …${platformSecret.slice(-4)}`)
    await savePlatformKey(PROD, jwt, orgId, platformSecret)
    await testPlatformKey(PROD, jwt, orgId)
    console.log('✓ production platform credential synced')
    try {
      await savePlatformKey(LOCAL, jwt, orgId, platformSecret)
      await testPlatformKey(LOCAL, jwt, orgId)
      console.log('✓ local platform credential synced')
    } catch (e) {
      console.warn(`○ local platform sync skipped (${e instanceof Error ? e.message : e})`)
    }
  } else {
    await testPlatformKey(PROD, jwt, orgId)
    console.log('✓ production platform credential verified (local sync skipped — deploy API for bootstrap-secret or set TEST_PLATFORM_KEY)')
  }

  const dashboardKey = await createDashboardKey(PROD, jwt, orgId)
  console.log(`✓ dashboard API key ${dashboardKey.slice(0, 16)}…${dashboardKey.slice(-4)}`)

  const lines = [
    `# Generated by scripts/e2e-bootstrap.mjs — do not commit`,
    `SANCTUM_E2E_API_KEY=${dashboardKey}`,
    `SANCTUM_ORG_ID=${orgId}`,
  ]
  if (platformSecret) lines.push(`TEST_PLATFORM_KEY=${platformSecret}`)
  lines.push('')
  writeFileSync(OUT, lines.join('\n'), { mode: 0o600 })
  console.log(`\nWrote ${OUT}`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
