#!/usr/bin/env node
/**
 * Create or refresh the marketing support inbox operator (Supabase auth + inbox allowlist).
 *
 * Usage: npm run provision:support-operator
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SUPPORT_OPERATOR_PASSWORD (generated and printed if unset)
 */
import { randomBytes } from 'node:crypto'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const EMAIL = 'support@sanctumruntime.com'
const DISPLAY_NAME = 'Alex Rivera'
const TITLE = 'Sanctum Support'
const PORTAL_URL = 'https://console.sanctumruntime.com/?page=support-inbox'

function fail(msg, detail) {
  console.error(`✗ ${msg}`, detail ?? '')
  process.exit(1)
}

function pass(msg) {
  console.log(`✓ ${msg}`)
}

function randomPassword() {
  return `${randomBytes(18).toString('base64url')}Aa1!`
}

async function findUserByEmail(admin, email) {
  let page = 1
  const perPage = 200
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) fail('listUsers', error.message)
    const match = data.users.find((u) => u.email?.trim().toLowerCase() === email)
    if (match) return match
    if (data.users.length < perPage) break
    page += 1
  }
  return null
}

async function upsertInboxConfig(admin) {
  const { data: row, error: readErr } = await admin
    .from('support_agent_config')
    .select('value')
    .eq('key', 'inbox')
    .maybeSingle()
  if (readErr) fail('read inbox config', readErr.message)

  const prev = row?.value && typeof row.value === 'object' ? row.value : {}
  const value = {
    ...prev,
    allowed_emails: [EMAIL],
    notify_email: EMAIL,
    operators: [
      {
        email: EMAIL,
        display_name: DISPLAY_NAME,
        title: TITLE,
      },
    ],
  }

  const { error: writeErr } = await admin.from('support_agent_config').upsert(
    {
      key: 'inbox',
      value,
      description: 'Human inbox operators and handoff notification targets',
    },
    { onConflict: 'key' },
  )
  if (writeErr) fail('upsert inbox config', writeErr.message)
  pass('inbox allowlist + operator profile saved')
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) {
    fail('missing env', 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  }

  const password = process.env.SUPPORT_OPERATOR_PASSWORD?.trim() || randomPassword()
  const generated = !process.env.SUPPORT_OPERATOR_PASSWORD?.trim()

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const existing = await findUserByEmail(admin, EMAIL)
  const metadata = {
    display_name: DISPLAY_NAME,
    full_name: DISPLAY_NAME,
    support_operator: true,
    title: TITLE,
  }

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), ...metadata },
    })
    if (error) fail('updateUser', error.message)
    pass(`updated auth user ${EMAIL}`)
  } else {
    const { error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) fail('createUser', error.message)
    pass(`created auth user ${EMAIL}`)
  }

  await upsertInboxConfig(admin)

  console.log('\nSupport operator ready\n')
  console.log(`  Name:     ${DISPLAY_NAME} (${TITLE})`)
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${password}${generated ? '  (save this — not stored in repo)' : ''}`)
  console.log(`  Portal:   ${PORTAL_URL}`)
  console.log('\nSign in at the portal URL above (not the runtime console /).')
  console.log('Optional API belt-and-suspenders: SUPPORT_INBOX_ALLOWED_EMAILS=support@sanctumruntime.com on sanctum-api.\n')
}

main().catch((err) => fail('provision failed', err instanceof Error ? err.message : String(err)))
