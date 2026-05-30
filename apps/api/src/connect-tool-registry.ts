import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type ConnectToolRow = {
  id: string
  org_id: string
  agent_id: string | null
  action: string
  description: string | null
  parameters_schema: Record<string, unknown> | null
  platform: string | null
  seen_count: number
  first_seen_at: string
  last_seen_at: string
}

const SENSITIVE = /send_|delete_|transfer_|execute_|unlock_|admin|password|payment|shell|drop_|truncate_/i
const SENSITIVE_SCHEMA = /password|secret|token|api_key|ssn|credit/i

export function suggestPolicyForTool(tool: {
  action: string
  parameters_schema?: Record<string, unknown> | null
  seen_count?: number
}): { recommendation: 'verify' | 'block' | 'approve'; reason: string } {
  const action = tool.action
  if (/execute_shell|delete_database|drop_table|format_disk/i.test(action)) {
    return { recommendation: 'block', reason: 'High-impact action pattern — recommend block.' }
  }
  if (SENSITIVE.test(action)) {
    return { recommendation: 'verify', reason: 'Sensitive action name — recommend human verification.' }
  }
  const schemaStr = JSON.stringify(tool.parameters_schema ?? {})
  if (SENSITIVE_SCHEMA.test(schemaStr)) {
    return { recommendation: 'verify', reason: 'Tool schema includes sensitive fields — recommend verification.' }
  }
  if ((tool.seen_count ?? 0) >= 10) {
    return { recommendation: 'verify', reason: `Seen ${tool.seen_count} times — consider a explicit policy.` }
  }
  return { recommendation: 'approve', reason: 'No sensitive signals — auto-approve is reasonable.' }
}

export async function upsertConnectTool(
  cfg: SupabaseAuthConfig,
  input: {
    orgId: string
    action: string
    agentId?: string | null
    platform?: string | null
    description?: string | null
    parametersSchema?: Record<string, unknown> | null
  },
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()
  const { data: existing } = await admin
    .from('connect_tools')
    .select('id, seen_count')
    .eq('org_id', input.orgId)
    .eq('action', input.action)
    .maybeSingle()

  if (existing) {
    await admin
      .from('connect_tools')
      .update({
        seen_count: (existing.seen_count as number) + 1,
        last_seen_at: now,
        agent_id: input.agentId ?? undefined,
        platform: input.platform ?? undefined,
        description: input.description ?? undefined,
        parameters_schema: input.parametersSchema ?? undefined,
      })
      .eq('id', existing.id)
    return
  }

  await admin.from('connect_tools').insert({
    org_id: input.orgId,
    action: input.action,
    agent_id: input.agentId ?? null,
    platform: input.platform ?? null,
    description: input.description ?? null,
    parameters_schema: input.parametersSchema ?? null,
    seen_count: 1,
    first_seen_at: now,
    last_seen_at: now,
  })
}

export async function listConnectTools(
  cfg: SupabaseAuthConfig,
  orgId: string,
  limit = 50,
): Promise<Array<ConnectToolRow & { suggestion: ReturnType<typeof suggestPolicyForTool> }>> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('connect_tools')
    .select('*')
    .eq('org_id', orgId)
    .order('last_seen_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    ...(row as ConnectToolRow),
    suggestion: suggestPolicyForTool(row as ConnectToolRow),
  }))
}

export function extractToolsFromChatBody(body: unknown): Array<{
  name: string
  description?: string
  parameters?: Record<string, unknown>
}> {
  const out: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }> = []
  if (!body || typeof body !== 'object') return out
  const tools = (body as { tools?: unknown[] }).tools
  if (!Array.isArray(tools)) return out
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue
    const row = t as { type?: string; function?: { name?: string; description?: string; parameters?: Record<string, unknown> } }
    const fn = row.function
    if (row.type === 'function' && fn?.name) {
      out.push({ name: fn.name, description: fn.description, parameters: fn.parameters })
    }
  }
  return out
}
