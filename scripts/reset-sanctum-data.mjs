#!/usr/bin/env node
/**
 * Wipe all Sanctum tenant data + auth users on the linked Supabase project.
 *
 * Preserves: public.plans, public.runtime_packages (marketplace catalog)
 * Removes: orgs, usage, audit, agents, billing rows, profiles, all auth.users
 *
 *   npm run data:reset -- --confirm RESET_SANCTUM_DATA
 *   npm run data:reset -- --confirm RESET_SANCTUM_DATA --keep-auth
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const CONFIRM_PHRASE = 'RESET_SANCTUM_DATA'
const sqlFile = resolve(root, 'scripts/sql/reset-sanctum-tenant-data.sql')

function parseArgs() {
  const args = process.argv.slice(2)
  const confirmIdx = args.indexOf('--confirm')
  const confirm = confirmIdx >= 0 ? args[confirmIdx + 1] : null
  const keepAuth = args.includes('--keep-auth')
  return { confirm, keepAuth }
}

function projectHost() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function deleteAllAuthUsers(admin) {
  let page = 1
  const perPage = 200
  let total = 0

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []
    if (users.length === 0) break

    for (const user of users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
      if (delErr) {
        console.error(`  failed to delete auth user ${user.id} (${user.email ?? 'no email'}):`, delErr.message)
      } else {
        total += 1
        console.log(`  deleted auth user ${user.email ?? user.id}`)
      }
    }

    if (users.length < perPage) break
    page += 1
  }

  return total
}

function runTenantSqlReset() {
  const result = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--linked', '-f', sqlFile],
    { cwd: root, stdio: 'inherit', env: process.env },
  )
  if (result.status !== 0) {
    throw new Error(
      'SQL reset failed. Ensure you are logged in: `npx supabase login` and project is linked.',
    )
  }
}

async function main() {
  const { confirm, keepAuth } = parseArgs()
  if (confirm !== CONFIRM_PHRASE) {
    console.error(`Usage: npm run data:reset -- --confirm ${CONFIRM_PHRASE} [--keep-auth]`)
    console.error('')
    console.error('This permanently deletes ALL organizations, usage, billing state, and auth users')
    console.error('on your linked Supabase project (see supabase/config.toml project_id).')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const host = projectHost()
  console.log('')
  console.log('=== Sanctum data reset ===')
  console.log(`Target: ${host ?? url}`)
  console.log(`Auth users: ${keepAuth ? 'KEEP' : 'DELETE ALL'}`)
  console.log('Public data: TRUNCATE all tables except plans + runtime_packages')
  console.log('')

  console.log('Step 1/2: Truncating tenant tables (SQL)...')
  runTenantSqlReset()
  console.log('  SQL reset complete.')

  if (!keepAuth) {
    console.log('Step 2/2: Deleting all Supabase Auth users...')
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const n = await deleteAllAuthUsers(admin)
    console.log(`  Deleted ${n} auth user(s).`)
  } else {
    console.log('Step 2/2: Skipped (--keep-auth).')
  }

  console.log('')
  console.log('Done. Sign up again in the dashboard — new accounts start on Observer with zero usage.')
  console.log('Creem billing rows are gone; upgrades must go through checkout + webhook again.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
