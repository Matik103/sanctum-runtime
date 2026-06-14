import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type SupportKbChunkMatch = {
  chunk_id: string
  source_id: string
  source_slug: string
  source_type: string
  source_title: string
  canonical_url: string | null
  chunk_kind: string
  heading: string | null
  content: string
  similarity: number
  intent_tags: string[]
  sales_weight: number
  sales_signals: Record<string, unknown>
}

export type SupportCitation = {
  slug: string
  title: string
  url: string | null
  chunk_id: string
}

export type SupportAgentConfig = {
  openrouter: {
    chat_model: string
    embedding_model: string
    embedding_dimensions: number
    temperature: number
    max_context_chunks: number
    sales_chunk_boost: number
    api_key?: string
  }
  persona: {
    name: string
    tone: string
    goals: string[]
    never: string[]
  }
  retrieval: {
    match_count: number
    match_threshold: number
    sales_intent_min_weight: number
    educational_source_types: string[]
    conversion_source_types: string[]
  }
}

const DEFAULT_CONFIG: SupportAgentConfig = {
  openrouter: {
    chat_model: 'openrouter/free',
    embedding_model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
    embedding_dimensions: 1536,
    temperature: 0.35,
    max_context_chunks: 8,
    sales_chunk_boost: 0.05,
  },
  persona: {
    name: 'Sanctum Guide',
    tone: 'helpful, precise, confident — runtime trust expert, not a generic chatbot',
    goals: [
      'Answer product and security questions using KB citations only',
      'Teach visitors with links to blog articles and docs',
      'Recommend Sanctum Runtime when execution-time control fits the problem',
    ],
    never: [
      'Invent features or pricing not in KB',
      'Claim guardrails replace runtime authorization',
      'Share customer org data',
    ],
  },
  retrieval: {
    match_count: 8,
    match_threshold: 0.72,
    sales_intent_min_weight: 6,
    educational_source_types: ['blog', 'docs', 'faq', 'glossary'],
    conversion_source_types: ['pricing', 'product', 'sales_playbook', 'comparison'],
  },
}

export class SupportAgentStore {
  private admin: ReturnType<typeof createSupabaseAdmin>

  constructor(cfg: SupabaseAuthConfig) {
    this.admin = createSupabaseAdmin(cfg)
  }

  async loadConfig(): Promise<SupportAgentConfig> {
    const { data } = await this.admin.from('support_agent_config').select('key, value')
    if (!data?.length) return DEFAULT_CONFIG

    const merged = structuredClone(DEFAULT_CONFIG) as Record<string, Record<string, unknown>>
    for (const row of data) {
      if (row.key in merged && row.value && typeof row.value === 'object') {
        merged[row.key] = { ...merged[row.key], ...(row.value as Record<string, unknown>) }
      }
    }
    return merged as unknown as SupportAgentConfig
  }

  async createSession(input: {
    referrer?: string
    landing_path?: string
    locale?: string
    visitor_fingerprint?: string
  }) {
    const { data, error } = await this.admin
      .from('support_agent_sessions')
      .insert({
        referrer: input.referrer ?? null,
        landing_path: input.landing_path ?? null,
        locale: input.locale ?? 'en',
        visitor_fingerprint: input.visitor_fingerprint ?? null,
      })
      .select('id, public_id, created_at')
      .single()
    if (error) throw error
    return data
  }

  async getSessionByPublicId(publicId: string) {
    const { data, error } = await this.admin
      .from('support_agent_sessions')
      .select('id, public_id, created_at, last_message_at')
      .eq('public_id', publicId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async listMessages(sessionId: string, limit = 40) {
    const { data, error } = await this.admin
      .from('support_agent_messages')
      .select('id, role, content, citation_sources, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return data ?? []
  }

  async addMessage(input: {
    session_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    citation_chunk_ids?: string[]
    citation_sources?: SupportCitation[]
    model?: string
    token_usage?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) {
    const { data, error } = await this.admin
      .from('support_agent_messages')
      .insert({
        session_id: input.session_id,
        role: input.role,
        content: input.content,
        citation_chunk_ids: input.citation_chunk_ids ?? [],
        citation_sources: input.citation_sources ?? [],
        model: input.model ?? null,
        token_usage: input.token_usage ?? {},
        metadata: input.metadata ?? {},
      })
      .select('id, role, content, citation_sources, created_at')
      .single()
    if (error) throw error

    await this.admin
      .from('support_agent_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', input.session_id)

    return data
  }

  async matchKbChunks(
    embedding: number[],
    opts: {
      match_count?: number
      match_threshold?: number
      filter_source_types?: string[] | null
      filter_intent_tags?: string[] | null
      min_sales_weight?: number | null
    },
  ): Promise<SupportKbChunkMatch[]> {
    const { data, error } = await this.admin.rpc('match_support_kb_chunks', {
      query_embedding: embedding,
      match_count: opts.match_count ?? 8,
      match_threshold: opts.match_threshold ?? 0.72,
      filter_source_types: opts.filter_source_types ?? null,
      filter_intent_tags: opts.filter_intent_tags ?? null,
      min_sales_weight: opts.min_sales_weight ?? null,
    })
    if (error) throw error
    return (data ?? []) as SupportKbChunkMatch[]
  }

  /** Text fallback when embeddings are not yet ingested. */
  async searchKbByText(query: string, limit = 6): Promise<SupportKbChunkMatch[]> {
    const terms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
      .slice(0, 4)
    if (!terms.length) return []

    const orFilter = terms
      .flatMap((t) => [
        `title.ilike.%${t}%`,
        `summary.ilike.%${t}%`,
        `content_markdown.ilike.%${t}%`,
      ])
      .join(',')

    const { data, error } = await this.admin
      .from('support_kb_sources')
      .select(
        'id, slug, source_type, title, canonical_url, content_markdown, intent_tags, sales_weight, sales_signals',
      )
      .eq('is_published', true)
      .or(orFilter)
      .order('sales_weight', { ascending: false })
      .limit(limit)
    if (error) throw error

    return (data ?? []).map((s, i) => {
      const excerpt = (s.content_markdown as string).slice(0, 1200)
      return {
        chunk_id: `text-${s.id}`,
        source_id: s.id as string,
        source_slug: s.slug as string,
        source_type: s.source_type as string,
        source_title: s.title as string,
        canonical_url: (s.canonical_url as string | null) ?? null,
        chunk_kind: 'paragraph',
        heading: null,
        content: excerpt,
        similarity: 0.5 - i * 0.02,
        intent_tags: (s.intent_tags as string[]) ?? [],
        sales_weight: (s.sales_weight as number) ?? 0,
        sales_signals: (s.sales_signals as Record<string, unknown>) ?? {},
      }
    })
  }
}
