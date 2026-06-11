/**
 * Shared helpers for production A–Z validation.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function loadA2zEnv() {
  config({ path: resolve(root, '.env') })
  config({ path: resolve(root, '.env.e2e.local'), override: true })
  config({ path: resolve(root, '.env.a2z.local'), override: true })
}

export const PROD_API = 'https://api.sanctumruntime.com'
export const PROD_CONSOLE = 'https://console.sanctumruntime.com'
export const PROD_MARKETING = 'https://www.sanctumruntime.com'

export function localApiUrl() {
  const host = process.env.HOST || '127.0.0.1'
  const port = process.env.PORT || '3001'
  return `http://${host}:${port}`
}

export function createReporter() {
  let failed = 0
  let skipped = 0
  const results = []

  return {
    ok(msg) {
      console.log(`  ✓ ${msg}`)
      results.push({ status: 'ok', msg })
    },
    skip(msg) {
      skipped++
      console.log(`  ○ ${msg}`)
      results.push({ status: 'skip', msg })
    },
    bad(msg, detail) {
      failed++
      const d = detail != null ? String(detail) : ''
      console.error(`  ✗ ${msg}${d ? ` — ${d}` : ''}`)
      results.push({ status: 'fail', msg, detail: d })
    },
    section(title) {
      console.log(`\n══ ${title} ${'═'.repeat(Math.max(0, 58 - title.length))}`)
    },
    get failed() {
      return failed
    },
    get skipped() {
      return skipped
    },
    summary() {
      const passed = results.filter((r) => r.status === 'ok').length
      return { passed, failed, skipped, results }
    },
  }
}

export async function waitForHealth(url, ms = 45000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return false
}

export async function apiJson(base, path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body != null ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
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

export function requireSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !serviceKey || !anonKey) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY')
  }
  return { url, serviceKey, anonKey }
}

export async function signInWithPassword(email, password) {
  const { url, anonKey } = requireSupabase()
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session?.access_token || !data.user?.id) throw new Error('no session after signIn')
  return { jwt: data.session.access_token, userId: data.user.id, auth }
}

export async function operatorJwtViaMagicLink(email) {
  const { url, serviceKey, anonKey } = requireSupabase()
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const { data: sess, error: e2 } = await auth.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  })
  if (e2 || !sess.session?.access_token) throw e2 ?? new Error('magic link session failed')
  const userId = sess.user?.id
  if (!userId) throw new Error('no user id')
  const { data: mems, error: memErr } = await admin
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
  if (memErr) throw memErr
  const orgId = mems?.[0]?.org_id
  if (!orgId) throw new Error('no org for user')
  return { jwt: sess.session.access_token, userId, orgId, admin }
}

export function resolveOpenAiKey() {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.TEST_PLATFORM_KEY?.trim() ||
    ''
  )
}

export function e2eBootstrapExists() {
  return existsSync(resolve(root, '.env.e2e.local'))
}

export function apiKeyHeader() {
  return (
    process.env.SANCTUM_E2E_API_KEY?.trim() ||
    process.env.SANCTUM_API_KEY?.trim() ||
    ''
  )
}
