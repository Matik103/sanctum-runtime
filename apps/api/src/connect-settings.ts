import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type ConnectOrgSettings = {
  org_id: string
  proxy_mode: 'gate' | 'observe'
  wait_verification: boolean
  wait_timeout_ms: number
  gate_tool_results: boolean
  redact_tool_arguments: boolean
  notify_on_hold: boolean
  applied_policy_preset: string | null
  enforce_action_token: boolean
  connect_webhook_url: string | null
  credential_environment: 'development' | 'staging' | 'production'
  updated_at: string
}

const DEFAULTS: Omit<ConnectOrgSettings, 'org_id' | 'updated_at'> = {
  proxy_mode: 'gate',
  wait_verification: true,
  wait_timeout_ms: 120_000,
  gate_tool_results: true,
  redact_tool_arguments: false,
  notify_on_hold: true,
  applied_policy_preset: null,
  enforce_action_token: false,
  connect_webhook_url: null,
  credential_environment: 'production',
}

export async function getConnectSettings(
  cfg: SupabaseAuthConfig,
  orgId: string,
): Promise<ConnectOrgSettings> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('connect_org_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) {
    return { org_id: orgId, ...DEFAULTS, updated_at: new Date().toISOString() }
  }
  return data as ConnectOrgSettings
}

export async function upsertConnectSettings(
  cfg: SupabaseAuthConfig,
  orgId: string,
  patch: Partial<Omit<ConnectOrgSettings, 'org_id' | 'updated_at'>>,
): Promise<ConnectOrgSettings> {
  const admin = createSupabaseAdmin(cfg)
  const current = await getConnectSettings(cfg, orgId)
  const row = {
    org_id: orgId,
    proxy_mode: patch.proxy_mode ?? current.proxy_mode,
    wait_verification: patch.wait_verification ?? current.wait_verification,
    wait_timeout_ms: patch.wait_timeout_ms ?? current.wait_timeout_ms,
    gate_tool_results: patch.gate_tool_results ?? current.gate_tool_results,
    redact_tool_arguments: patch.redact_tool_arguments ?? current.redact_tool_arguments,
    notify_on_hold: patch.notify_on_hold ?? current.notify_on_hold,
    applied_policy_preset: patch.applied_policy_preset ?? current.applied_policy_preset,
    enforce_action_token: patch.enforce_action_token ?? current.enforce_action_token,
    connect_webhook_url: patch.connect_webhook_url ?? current.connect_webhook_url,
    credential_environment: patch.credential_environment ?? current.credential_environment,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await admin
    .from('connect_org_settings')
    .upsert(row, { onConflict: 'org_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as ConnectOrgSettings
}
