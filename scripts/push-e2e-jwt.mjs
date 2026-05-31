#!/usr/bin/env node
/** Print a one-line dashboard JWT for push E2E curl tests. */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env'), quiet: true })

const email = process.env.TEST_USER_EMAIL?.trim() || 'businessappads@gmail.com'
const url = process.env.SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim()

if (!url || !serviceKey || !anonKey) {
  process.stderr.write('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY in .env\n')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) throw error

const { data: sess, error: verifyErr } = await auth.auth.verifyOtp({
  token_hash: data.properties.hashed_token,
  type: 'magiclink',
})

if (verifyErr || !sess.session?.access_token) {
  throw verifyErr ?? new Error('no session')
}

process.stdout.write(sess.session.access_token)
