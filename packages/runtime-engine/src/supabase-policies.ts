import type { ActionPolicy, PolicyMap } from '@sanctum-runtime/sdk'
import { getSupabaseServiceClient } from './supabase-client.js'

function orgIdFromActionKey(actionKey: string): string | null {
  const i = actionKey.indexOf(':')
  if (i <= 0) return null
  return actionKey.slice(0, i)
}

export async function loadPoliciesFromSupabase(): Promise<PolicyMap | null> {
  const sb = getSupabaseServiceClient()
  if (!sb) return null

  const { data, error } = await sb.from('runtime_policies').select('action_key, policy')
  if (error) {
    console.error('[sanctum] load policies from Supabase failed:', error.message)
    return null
  }
  if (!data?.length) return null

  const map: PolicyMap = {}
  for (const row of data) {
    map[row.action_key] = row.policy as ActionPolicy
  }
  return map
}

export async function syncPoliciesToSupabase(policies: PolicyMap): Promise<void> {
  const sb = getSupabaseServiceClient()
  if (!sb) return

  const rows = Object.entries(policies).map(([action_key, policy]) => ({
    action_key,
    org_id: orgIdFromActionKey(action_key),
    policy,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await sb.from('runtime_policies').upsert(rows, {
    onConflict: 'action_key',
  })
  if (error) {
    console.error('[sanctum] sync policies to Supabase failed:', error.message)
  }
}

/** Seed full policy map when `runtime_policies` is empty (first deploy). */
export async function seedPoliciesToSupabaseIfEmpty(policies: PolicyMap): Promise<void> {
  const existing = await loadPoliciesFromSupabase()
  if (existing && Object.keys(existing).length > 0) return
  await syncPoliciesToSupabase(policies)
}

export async function syncPolicyToSupabase(
  actionKey: string,
  policy: ActionPolicy,
): Promise<void> {
  const sb = getSupabaseServiceClient()
  if (!sb) return
  const { error } = await sb.from('runtime_policies').upsert(
    {
      action_key: actionKey,
      org_id: orgIdFromActionKey(actionKey),
      policy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'action_key' },
  )
  if (error) {
    console.error(`[sanctum] sync policy ${actionKey} to Supabase failed:`, error.message)
  }
}

export async function deletePolicyFromSupabase(actionKey: string): Promise<void> {
  const sb = getSupabaseServiceClient()
  if (!sb) return
  const { error } = await sb.from('runtime_policies').delete().eq('action_key', actionKey)
  if (error) {
    console.error('[sanctum] delete policy from Supabase failed:', error.message)
  }
}
