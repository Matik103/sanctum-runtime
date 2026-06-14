#!/usr/bin/env node
/**
 * Pull OPENROUTER_API_KEY from Supabase Edge Function secrets into support_agent_config.
 * Secrets are not readable via CLI — this invokes sync-support-openrouter (service role).
 *
 *   npm run support:pull-openrouter
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

function loadDotEnv() {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadDotEnv()

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Restore from .env backup or npm run env:pull')
  process.exit(1)
}

const endpoint = `${url}/functions/v1/sync-support-openrouter`
console.log(`POST ${endpoint}`)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    ...(anonKey ? { apikey: anonKey } : {}),
    'Content-Type': 'application/json',
  },
  body: '{}',
})

const body = await res.json().catch(() => ({}))
console.log(JSON.stringify(body, null, 2))

if (!res.ok || !body.ok) {
  console.error(`\nFailed (HTTP ${res.status}). Deploy the function first:`)
  console.error('  supabase functions deploy sync-support-openrouter --project-ref <ref>')
  process.exit(1)
}

console.log('\n✓ OpenRouter key synced to support_agent_config (API reads from DB when env unset)')
