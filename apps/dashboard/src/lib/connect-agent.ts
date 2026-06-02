import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

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

export type ConnectHealth = {
  ok: boolean
  period_days: number
  settings: ConnectOrgSettings
  platforms_configured: number
  credentials: Array<{
    platform: string
    key_suffix: string
    last_test_ok: boolean | null
    last_tested_at: string | null
    age_days: number
  }>
  events: {
    total: number
    by_decision: Record<string, number>
    by_platform: Record<string, number>
    last_event_at: string | null
  }
  top_tools: Array<{ action: string; count: number }>
  usage_30d: Record<string, number>
}

export type ConnectPreset = {
  id: string
  name: string
  description: string
  proxy_mode: 'gate' | 'observe'
  active: boolean
}

export type PolicySuggestion = {
  action: string
  count: number
  recommendation: 'verify' | 'block'
  reason: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export async function fetchConnectHealth(orgId: string): Promise<ConnectHealth> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/health`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`connect_health_failed:${res.status}`)
  return res.json() as Promise<ConnectHealth>
}

export async function fetchConnectSettings(orgId: string): Promise<ConnectOrgSettings> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`connect_settings_failed:${res.status}`)
  return res.json() as Promise<ConnectOrgSettings>
}

export async function updateConnectSettings(
  orgId: string,
  patch: Partial<Omit<ConnectOrgSettings, 'org_id' | 'updated_at'>>,
): Promise<ConnectOrgSettings> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/settings`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`connect_settings_update_failed:${res.status}`)
  return res.json() as Promise<ConnectOrgSettings>
}

export async function fetchConnectPresets(orgId: string): Promise<{
  presets: ConnectPreset[]
  applied: string | null
}> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/policy-presets`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`connect_presets_failed:${res.status}`)
  return res.json() as Promise<{ presets: ConnectPreset[]; applied: string | null }>
}

export async function applyConnectPreset(orgId: string, presetId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/policy-presets/${presetId}/apply`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(await responseError(res, 'connect_preset_apply_failed'))
}

export async function fetchPolicySuggestions(orgId: string): Promise<PolicySuggestion[]> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/suggest-policies`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`connect_suggest_failed:${res.status}`)
  const data = (await res.json()) as { suggestions: PolicySuggestion[] }
  return data.suggestions
}

export async function runConnectTest(
  orgId: string,
  agentId: string,
  platform?: string,
): Promise<{ ok: boolean; status?: number; action?: string; decision?: string; reasoning?: string }> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/test-run`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ agent_id: agentId, platform }),
  })
  if (!res.ok) throw new Error(await responseError(res, 'connect_test_failed'))
  return res.json() as Promise<{ ok: boolean; status?: number; action?: string; decision?: string; reasoning?: string }>
}

export async function applyToolPolicy(
  orgId: string,
  action: string,
  mode: 'verify' | 'block' | 'approve',
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/tools/${encodeURIComponent(action)}/policy`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mode }),
  })
  if (!res.ok) throw new Error(`connect_tool_policy_failed:${res.status}`)
}

export type ConnectShieldPreset = {
  id: string
  name: string
  description: string
  policy_preset_id: string
  shield_rules: unknown[]
}

export async function fetchConnectShieldPresets(orgId: string): Promise<ConnectShieldPreset[]> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/shield-presets`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`connect_shield_presets_failed:${res.status}`)
  const data = (await res.json()) as { presets: ConnectShieldPreset[] }
  return data.presets
}

export async function applyConnectShieldPreset(orgId: string, presetId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/shield-presets/${presetId}/apply`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(await responseError(res, 'connect_shield_preset_apply_failed'))
}

export async function promoteConnectToGate(orgId: string): Promise<ConnectOrgSettings> {
  const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/promote-to-gate`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`connect_promote_failed:${res.status}`)
  return res.json() as Promise<ConnectOrgSettings>
}

export function connectPackageSnippet(platform: string): string {
  return `import { ConnectClient, runGatedToolCalls } from '@sanctum-runtime/connect'

const connect = new ConnectClient({
  apiUrl: '${apiBaseUrl}',
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
  platform: '${platform}',
})

// After proxy returns tool_calls, gate local execution:
await runGatedToolCalls(toolCalls, executors, {
  apiUrl: '${apiBaseUrl}',
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
  platform: '${platform}',
})`
}

async function responseError(res: Response, fallback: string): Promise<string> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: unknown; detail?: unknown; message?: unknown; code?: unknown }
    const pieces = [body.error, body.detail, body.message, body.code].filter((value): value is string => typeof value === 'string' && value.length > 0)
    detail = pieces.join(' · ')
  } catch {
    detail = ''
  }
  return detail ? `${fallback}:${res.status} — ${detail}` : `${fallback}:${res.status}`
}

export function executionSnippet(platform: string, lang: 'python' | 'typescript'): string {
  const verifyUrl = `${apiBaseUrl}/v1/connect/verify-execution`
  if (lang === 'python') {
    return `import httpx

SANCTUM_VERIFY = "${verifyUrl}"
AGENT_TOKEN = "sk_agent_..."

def sanctum_execute_tool(name: str, args: dict, tool_call_id: str) -> str | None:
    """Verify before running a tool locally — mirrors SDK verifyAction + wait."""
    r = httpx.post(
        SANCTUM_VERIFY,
        headers={"X-Sanctum-Agent-Token": AGENT_TOKEN},
        json={
            "action": name,
            "arguments": args,
            "tool_call_id": tool_call_id,
            "platform": "${platform}",
        },
        timeout=130,
    )
    if r.status_code != 200:
        detail = r.json()
        raise RuntimeError(detail.get("reasoning") or detail.get("error") or "blocked")
    return r.json().get("actionToken")

# After model proposes tool_calls, gate execution:
# token = sanctum_execute_tool("send_email", {"to": "..."}, call.id)
# if token: actually_send_email(...)`
  }
  return `const SANCTUM_VERIFY = '${verifyUrl}'
const AGENT_TOKEN = 'sk_agent_...'

export async function sanctumExecuteTool(
  name: string,
  args: Record<string, unknown>,
  toolCallId: string,
): Promise<string | null> {
  const res = await fetch(SANCTUM_VERIFY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sanctum-Agent-Token': AGENT_TOKEN,
    },
    body: JSON.stringify({
      action: name,
      arguments: args,
      tool_call_id: toolCallId,
      platform: '${platform}',
    }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.reasoning ?? detail.error ?? 'blocked')
  }
  const body = await res.json()
  return body.actionToken ?? null
}

// After model proposes tool_calls, gate execution before running locally.`
}

export function langChainSnippet(platform: string): string {
  const proxyUrl = `${apiBaseUrl}/v1/proxy/${platform}`
  return `from langchain_openai import ChatOpenAI

# Route LangChain through Connect proxy — tool proposals are gated automatically.
llm = ChatOpenAI(
    base_url="${proxyUrl}",
    api_key="optional-if-saved-in-connect",
    default_headers={"X-Sanctum-Agent-Token": "sk_agent_..."},
    model="your-model",
)

# For local tool execution, call sanctum_execute_tool (see execution snippet).`
}
