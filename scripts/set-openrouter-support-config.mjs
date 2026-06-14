#!/usr/bin/env node
/**
 * Store OpenRouter API key in support_agent_config (service_role).
 * The Render API reads OPENROUTER_API_KEY from env first; this is the DB fallback.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... node scripts/set-openrouter-support-config.mjs
 *
 * Note: Supabase Edge Function secrets are NOT visible to the Render API.
 * Set OPENROUTER_API_KEY on Render (sanctum-api) OR run this script.
 */
import { createClient } from '@supabase/supabase-js'

const key = process.env.OPENROUTER_API_KEY?.trim()
const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim()

if (!key) {
  console.error('Set OPENROUTER_API_KEY')
  process.exit(1)
}
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)')
  process.exit(1)
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data: row, error: readErr } = await sb
  .from('support_agent_config')
  .select('value')
  .eq('key', 'openrouter')
  .maybeSingle()

if (readErr) {
  console.error('Read failed:', readErr.message)
  process.exit(1)
}

const value = { ...(row?.value ?? {}), api_key: key }

const { error: writeErr } = await sb
  .from('support_agent_config')
  .upsert({ key: 'openrouter', value, description: row ? undefined : 'OpenRouter model IDs and API key' })

if (writeErr) {
  console.error('Write failed:', writeErr.message)
  process.exit(1)
}

console.log('✓ support_agent_config.openrouter.api_key updated (service_role only)')
