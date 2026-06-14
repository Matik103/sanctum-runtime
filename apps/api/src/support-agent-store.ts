import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import {
  detectSalesIntent,
  extractPhrases,
  extractSearchTerms,
  phraseSourceHints,
  scoreKbSource,
  termsForSourceQuery,
  topicHintsForMessage,
} from './support-agent-retrieval.js'

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

export type SupportHandoff = {
  recommended: boolean
  reason: 'requested' | 'low_confidence' | 'sales' | 'fallback'
  label: string
  url: string
  email: string
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
    chat_model: 'meta-llama/llama-3.3-70b-instruct:free',
    embedding_model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
    embedding_dimensions: 1536,
    temperature: 0.45,
    max_context_chunks: 8,
    sales_chunk_boost: 0.05,
  },
  persona: {
    name: 'Sanctum Guide',
    tone: 'conversational, warm, and precise — a runtime trust expert who answers first and routes to humans only when asked',
    goals: [
      'Answer any visitor question using the knowledge base — product, security, pricing, integrations, and getting started',
      'Teach with clear explanations and links to blog articles and docs',
      'Synthesize across KB excerpts instead of deflecting to contact',
      'Recommend Sanctum Runtime when execution-time control fits the problem',
    ],
    never: [
      'Invent features or pricing not in KB',
      'Claim guardrails replace runtime authorization',
      'Share customer org data',
      'Offer human or sales contact unless the visitor explicitly asks',
    ],
  },
  retrieval: {
    match_count: 8,
    match_threshold: 0.65,
    sales_intent_min_weight: 4,
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
      .select('id, role, content, citation_sources, metadata, created_at')
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
      .select('id, role, content, citation_sources, metadata, created_at')
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

  async fetchKbSourcesBySlugs(slugs: string[]): Promise<SupportKbChunkMatch[]> {
    if (!slugs.length) return []
    const { data, error } = await this.admin
      .from('support_kb_sources')
      .select(
        'id, slug, source_type, title, canonical_url, content_markdown, intent_tags, sales_weight, sales_signals',
      )
      .eq('is_published', true)
      .in('slug', slugs)
    if (error) throw error

    const bySlug = new Map((data ?? []).map((s) => [s.slug as string, s]))
    return slugs
      .map((slug, i) => {
        const s = bySlug.get(slug)
        if (!s) return null
        return this.sourceRowToTextMatch(s, 0.92 - i * 0.01)
      })
      .filter((c): c is SupportKbChunkMatch => c !== null)
  }

  private sourceRowToTextMatch(
    s: Record<string, unknown>,
    similarity: number,
  ): SupportKbChunkMatch {
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
      similarity,
      intent_tags: (s.intent_tags as string[]) ?? [],
      sales_weight: (s.sales_weight as number) ?? 0,
      sales_signals: (s.sales_signals as Record<string, unknown>) ?? {},
    }
  }

  /** Text fallback when embeddings are not yet ingested. */
  async searchKbByText(query: string, limit = 6): Promise<SupportKbChunkMatch[]> {
    const salesIntent = detectSalesIntent(query)
    const terms = extractSearchTerms(query, salesIntent)
    const phrases = extractPhrases(query)
    if (!terms.length) return []

    const pinnedSlugs = [
      ...(salesIntent ? ['page/pricing', 'product/overview'] : []),
      ...phraseSourceHints(phrases, terms),
      ...topicHintsForMessage(query),
    ]
    const pinned = await this.fetchKbSourcesBySlugs([...new Set(pinnedSlugs)])

    const searchTerms = termsForSourceQuery(terms)
    const orFilter = searchTerms
      .flatMap((t) => [`title.ilike.%${t}%`, `summary.ilike.%${t}%`, `content_markdown.ilike.%${t}%`])
      .join(',')

    const { data, error } = await this.admin
      .from('support_kb_sources')
      .select(
        'id, slug, source_type, title, summary, canonical_url, content_markdown, intent_tags, sales_weight, sales_signals',
      )
      .eq('is_published', true)
      .or(orFilter)
      .limit(Math.max(limit * 5, 24))
    if (error) throw error

    const scored = (data ?? [])
      .map((s) => ({
        row: s,
        score: scoreKbSource(
          {
            title: s.title as string,
            summary: s.summary as string | null,
            content_markdown: s.content_markdown as string,
            source_type: s.source_type as string,
            sales_weight: (s.sales_weight as number) ?? 0,
          },
          terms,
          salesIntent,
          phrases,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const matches = scored.map((x, i) =>
      this.sourceRowToTextMatch(x.row as Record<string, unknown>, 0.88 - i * 0.03),
    )

    const seen = new Set<string>()
    const merged: SupportKbChunkMatch[] = []
    for (const c of [...pinned, ...matches]) {
      if (seen.has(c.source_slug)) continue
      seen.add(c.source_slug)
      merged.push(c)
    }
    return merged.slice(0, limit)
  }
}
