import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type AgentMemoryEntry = {
  id: string
  org_id: string
  runtime_id: string
  agent_id: string
  memory_key: string
  ciphertext: string
  iv: string
  algorithm: string
  key_hint: string | null
  metadata: Record<string, unknown>
  version: number
  created_at: string
  updated_at: string
}

export type AgentMemoryBlob = {
  ciphertext: string
  iv: string
  algorithm?: string
  keyHint?: string
  metadata?: Record<string, unknown>
}

export class AgentMemoryStore {
  constructor(private supabase: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.supabase)
  }

  async upsert(
    runtimeId: string,
    orgId: string,
    agentId: string,
    memoryKey: string,
    blob: AgentMemoryBlob,
  ): Promise<AgentMemoryEntry> {
    const { data, error } = await this.admin()
      .from('agent_memory_entries')
      .upsert(
        {
          org_id: orgId,
          runtime_id: runtimeId,
          agent_id: agentId,
          memory_key: memoryKey,
          ciphertext: blob.ciphertext,
          iv: blob.iv,
          algorithm: blob.algorithm ?? 'aes-256-gcm',
          key_hint: blob.keyHint ?? null,
          metadata: blob.metadata ?? {},
        },
        { onConflict: 'runtime_id,agent_id,memory_key' },
      )
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as AgentMemoryEntry
  }

  async get(
    runtimeId: string,
    agentId: string,
    memoryKey: string,
  ): Promise<AgentMemoryEntry | null> {
    const { data, error } = await this.admin()
      .from('agent_memory_entries')
      .select('*')
      .eq('runtime_id', runtimeId)
      .eq('agent_id', agentId)
      .eq('memory_key', memoryKey)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as AgentMemoryEntry) ?? null
  }

  async list(runtimeId: string, agentId: string): Promise<
    { memoryKey: string; keyHint: string | null; updatedAt: string }[]
  > {
    const { data, error } = await this.admin()
      .from('agent_memory_entries')
      .select('memory_key, key_hint, updated_at')
      .eq('runtime_id', runtimeId)
      .eq('agent_id', agentId)
      .order('memory_key')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: Record<string, string | null>) => ({
      memoryKey: r.memory_key as string,
      keyHint: r.key_hint,
      updatedAt: r.updated_at as string,
    }))
  }

  async delete(runtimeId: string, agentId: string, memoryKey: string): Promise<boolean> {
    const { error, count } = await this.admin()
      .from('agent_memory_entries')
      .delete({ count: 'exact' })
      .eq('runtime_id', runtimeId)
      .eq('agent_id', agentId)
      .eq('memory_key', memoryKey)
    if (error) throw new Error(error.message)
    return (count ?? 0) > 0
  }
}
