/**
 * Sync OPENROUTER_API_KEY from Edge Function secrets into support_agent_config.
 * Service role only — for local API + KB sync (secrets are not readable via CLI).
 *
 *   npm run support:pull-openrouter
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCorsPreflight, jsonWithCors } from '../_shared/cors.ts'

function jwtRole(authHeader: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function requireServiceRole(req: Request): Response | null {
  const auth = req.headers.get('Authorization')?.trim() ?? ''
  if (!auth.startsWith('Bearer ') || jwtRole(auth) !== 'service_role') {
    return jsonWithCors(
      req,
      {
        error: 'forbidden',
        hint: 'Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY JWT>',
      },
      { status: 403 },
    )
  }
  return null
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const denied = requireServiceRole(req)
  if (denied) return denied

  if (req.method !== 'POST') {
    return jsonWithCors(req, { error: 'method_not_allowed' }, { status: 405 })
  }

  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')?.trim()
  if (!openRouterKey) {
    return jsonWithCors(
      req,
      {
        ok: false,
        error: 'OPENROUTER_API_KEY missing from Edge Function secrets',
        hint: 'supabase secrets set OPENROUTER_API_KEY=sk-or-... --project-ref <ref>',
      },
      { status: 500 },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceKey) {
    return jsonWithCors(req, { ok: false, error: 'supabase_env_missing' }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: row, error: readErr } = await sb
    .from('support_agent_config')
    .select('value')
    .eq('key', 'openrouter')
    .maybeSingle()

  if (readErr) {
    return jsonWithCors(req, { ok: false, error: readErr.message }, { status: 500 })
  }

  const value = { ...(row?.value ?? {}), api_key: openRouterKey }
  const { error: writeErr } = await sb.from('support_agent_config').upsert({
    key: 'openrouter',
    value,
    description: row ? undefined : 'OpenRouter model IDs and API key',
  })

  if (writeErr) {
    return jsonWithCors(req, { ok: false, error: writeErr.message }, { status: 500 })
  }

  return jsonWithCors(req, {
    ok: true,
    api_key_synced: true,
    chat_model: (value as { chat_model?: string }).chat_model ?? null,
    embedding_model: (value as { embedding_model?: string }).embedding_model ?? null,
  })
})
