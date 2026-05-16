#!/usr/bin/env node
/**
 * Pull Supabase API keys from your linked project into repo-root `.env`.
 * Uses Management API (same keys as Dashboard → Settings → API), not Edge Function secret digests.
 *
 *   supabase login
 *   npm run env:pull
 *
 * Optional: SUPABASE_PROJECT_REF=nimvcudvrhanxlcpiizz
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
function normalizeSupabaseUrl(raw) {
  let u = raw.trim().replace(/\/$/, '')
  u = u.replace(/\/rest\/v1\/?$/i, '')
  return u
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

function projectRef() {
  const fromEnv = process.env.SUPABASE_PROJECT_REF?.trim()
  if (fromEnv) return fromEnv
  const linked = resolve(root, 'supabase/.temp/project-ref')
  if (existsSync(linked)) return readFileSync(linked, 'utf8').trim()
  const configPath = resolve(root, 'supabase/config.toml')
  if (existsSync(configPath)) {
    const m = readFileSync(configPath, 'utf8').match(/project_id\s*=\s*"([^"]+)"/)
    if (m) return m[1]
  }
  throw new Error(
    'Set SUPABASE_PROJECT_REF, run `supabase link --project-ref YOUR_REF`, or set project_id in supabase/config.toml',
  )
}

function parseApiKeysEnv(stdout) {
  const out = {}
  for (const line of stdout.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"\s*$/)
    if (m) out[m[1]] = m[2].replace(/\\"/g, '"')
  }
  return out
}

function parseEnvFile(content) {
  const lines = content.split('\n')
  const map = new Map()
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (m) map.set(m[1], m[2])
  }
  return { lines, map }
}

function upsert(lines, map, key, value) {
  const quoted = value.includes(' ') || value.includes('#') ? `"${value}"` : value
  if (map.has(key)) {
    return lines.map((line) => (line.startsWith(`${key}=`) ? `${key}=${quoted}` : line))
  }
  return [...lines, `${key}=${quoted}`]
}

function main() {
  const ref = projectRef()
  const url = normalizeSupabaseUrl(`https://${ref}.supabase.co`)

  let stdout
  try {
    stdout = execSync(`supabase projects api-keys --project-ref ${ref} -o env`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    })
  } catch {
    console.error('Run: supabase login')
    process.exit(1)
  }

  const keys = parseApiKeysEnv(stdout)
  const anon = keys.SUPABASE_ANON_KEY
  const service = keys.SUPABASE_SERVICE_ROLE_KEY
  if (!anon || !service) {
    console.error('Could not read anon/service_role keys from Supabase CLI')
    process.exit(1)
  }

  let content = ''
  let lines = []
  let map = new Map()
  if (existsSync(envPath)) {
    content = readFileSync(envPath, 'utf8')
    ;({ lines, map } = parseEnvFile(content))
  } else if (existsSync(resolve(root, '.env.example'))) {
    content = readFileSync(resolve(root, '.env.example'), 'utf8')
    ;({ lines, map } = parseEnvFile(content))
  }

  const pairs = {
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anon,
    VITE_SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_PROJECT_REF: ref,
  }

  for (const [key, value] of Object.entries(pairs)) {
    lines = upsert(lines, map, key, value)
    map.set(key, value)
  }

  writeFileSync(envPath, `${lines.join('\n').replace(/\n*$/, '')}\n`)
  console.log(`Updated ${envPath}`)
  console.log(`  VITE_SUPABASE_URL=${url}`)
  console.log('  VITE_SUPABASE_ANON_KEY=***')
  console.log('  VITE_SUPABASE_SERVICE_ROLE_KEY=*** (server only — never ship to dashboard build)')
  console.log('\nRestart: npm run dev:runtime')
}

main()
