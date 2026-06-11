#!/usr/bin/env node
/**
 * Run Creem diagnostics on Supabase (uses Edge Function secrets).
 *
 *   supabase login
 *   npm run env:pull          # if .env missing Supabase keys
 *   npm run creem:verify-remote
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
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim()

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run: npm run env:pull')
  process.exit(1)
}

const endpoint = `${url}/functions/v1/creem-verify`
console.log(`POST ${endpoint}\n`)

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    ...(anonKey ? { apikey: anonKey } : {}),
    'Content-Type': 'application/json',
  },
})

const body = await res.json().catch(() => ({}))
console.log(JSON.stringify(body, null, 2))

if (!res.ok) {
  console.error(`\nHTTP ${res.status}`)
  process.exit(1)
}

if (body.ok) {
  console.log('\n✓ Creem billing configuration is healthy.')
} else {
  console.error('\n✗ Issues found:')
  for (const fix of body.fixes ?? []) console.error(`  • ${fix}`)
  process.exit(1)
}
