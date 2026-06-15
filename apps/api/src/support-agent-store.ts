import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import {
  HANDOFF_CONFIRMATION_MARKER,
  OPERATOR_JOINED_MARKER,
  SUPPORT_VISITOR_COPY,
} from './support-visitor-copy.js'
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

export type SupportSessionStatus = 'bot' | 'queued' | 'human_active' | 'resolved'

export type SupportInboxSession = {
  id: string
  public_id: string
  status: SupportSessionStatus
  handoff_reason: string | null
  assigned_operator_id: string | null
  assigned_operator_email: string | null
  landing_path: string | null
  escalated_at: string | null
  resolved_at: string | null
  last_message_at: string | null
  created_at: string
  preview?: string | null
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
    tone: 'concierge-level clarity — confident, warm, never apologetic about AI limits; bring specialists in-thread when the visitor wants a person',
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
      .select(
        'id, public_id, created_at, last_message_at, status, handoff_reason, assigned_operator_id, assigned_operator_email, landing_path, escalated_at, resolved_at',
      )
      .eq('public_id', publicId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  async loadInboxConfig(): Promise<{
    allowed_emails: string[]
    notify_email: string
    slack_webhook_url: string | null
    operators: unknown
  }> {
    const { data } = await this.admin
      .from('support_agent_config')
      .select('value')
      .eq('key', 'inbox')
      .maybeSingle()
    const v = (data?.value ?? {}) as Record<string, unknown>
    return {
      allowed_emails: Array.isArray(v.allowed_emails)
        ? (v.allowed_emails as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean)
        : [],
      notify_email:
        typeof v.notify_email === 'string' && v.notify_email.trim()
          ? v.notify_email.trim()
          : 'support@sanctumruntime.com',
      slack_webhook_url:
        typeof v.slack_webhook_url === 'string' && v.slack_webhook_url.trim()
          ? v.slack_webhook_url.trim()
          : null,
      operators: v.operators ?? [],
    }
  }

  async recordEvent(input: {
    session_id?: string | null
    message_id?: string | null
    event_type: string
    payload?: Record<string, unknown>
  }) {
    const { error } = await this.admin.from('support_agent_events').insert({
      session_id: input.session_id ?? null,
      message_id: input.message_id ?? null,
      event_type: input.event_type,
      payload: input.payload ?? {},
    })
    if (error) throw error
  }

  async recordFeedback(input: {
    message_id: string
    session_id: string
    rating: -1 | 1
    comment?: string
  }) {
    const { data, error } = await this.admin
      .from('support_agent_message_feedback')
      .upsert(
        {
          message_id: input.message_id,
          session_id: input.session_id,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        { onConflict: 'message_id' },
      )
      .select('id, rating, created_at')
      .single()
    if (error) throw error
    return data
  }

  async escalateSession(input: {
    session_id: string
    reason: string
    notify?: boolean
  }): Promise<{ alreadyQueued: boolean }> {
    const { data: current } = await this.admin
      .from('support_agent_sessions')
      .select('status')
      .eq('id', input.session_id)
      .maybeSingle()

    if (current?.status === 'queued' || current?.status === 'human_active') {
      return { alreadyQueued: true }
    }

    const { error } = await this.admin
      .from('support_agent_sessions')
      .update({
        status: 'queued',
        handoff_reason: input.reason,
        escalated_at: new Date().toISOString(),
        resolved_at: null,
      })
      .eq('id', input.session_id)
    if (error) throw error

    await this.recordEvent({
      session_id: input.session_id,
      event_type: 'handoff_requested',
      payload: { reason: input.reason, notify: input.notify ?? true },
    })
    return { alreadyQueued: false }
  }

  async addQueueConfirmation(sessionId: string) {
    const recent = await this.listMessages(sessionId, 6)
    const marker = HANDOFF_CONFIRMATION_MARKER.toLowerCase()
    const already = recent.some((m) => (m.content as string).toLowerCase().includes(marker))
    if (already) {
      return [...recent].reverse().find((m) => (m.content as string).toLowerCase().includes(marker)) ?? null
    }

    return this.addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: SUPPORT_VISITOR_COPY.handoffConfirmed,
      metadata: { handoff: null, follow_ups: [], sender: 'system' },
    })
  }

  async addOperatorJoinedMessage(sessionId: string, operatorDisplayName: string) {
    const nameLower = operatorDisplayName.trim().toLowerCase()
    const joinedMarker = OPERATOR_JOINED_MARKER.toLowerCase()
    const { data: existing, error: lookupError } = await this.admin
      .from('support_agent_messages')
      .select('content')
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .ilike('content', `%${OPERATOR_JOINED_MARKER}%`)
      .limit(24)
    if (lookupError) throw lookupError
    const already = (existing ?? []).some((row) => {
      const content = (row.content as string).toLowerCase()
      return content.includes(joinedMarker) && content.includes(nameLower)
    })
    if (already) return null

    return this.addMessage({
      session_id: sessionId,
      role: 'assistant',
      content: SUPPORT_VISITOR_COPY.operatorJoined(operatorDisplayName),
      metadata: { handoff: null, follow_ups: [], sender: 'system' },
    })
  }

  async claimSession(input: {
    session_id: string
    operator_id: string
    operator_email: string
  }) {
    const { data, error } = await this.admin
      .from('support_agent_sessions')
      .update({
        status: 'human_active',
        assigned_operator_id: input.operator_id,
        assigned_operator_email: input.operator_email,
      })
      .eq('id', input.session_id)
      .in('status', ['queued', 'human_active'])
      .select('id, public_id, status')
      .maybeSingle()
    if (error) throw error
    if (data) {
      await this.recordEvent({
        session_id: input.session_id,
        event_type: 'operator_claimed',
        payload: { operator_email: input.operator_email },
      })
    }
    return data
  }

  async resolveSession(sessionId: string, operatorEmail?: string) {
    const { data, error } = await this.admin
      .from('support_agent_sessions')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select('id, public_id, status')
      .maybeSingle()
    if (error) throw error
    if (data) {
      await this.recordEvent({
        session_id: sessionId,
        event_type: 'session_resolved',
        payload: { operator_email: operatorEmail ?? null },
      })
    }
    return data
  }

  async addOperatorMessage(input: {
    session_id: string
    content: string
    operator_id: string
    operator_email: string
    operator_display_name?: string
  }) {
    return this.addMessage({
      session_id: input.session_id,
      role: 'assistant',
      content: input.content,
      metadata: {
        sender: 'operator',
        operator_id: input.operator_id,
        operator_email: input.operator_email,
        operator_display_name: input.operator_display_name?.trim() || null,
      },
    })
  }

  async listInboxSessions(opts: { status?: SupportSessionStatus[]; limit?: number }) {
    const statuses = opts.status ?? ['queued', 'human_active']
    const { data, error } = await this.admin
      .from('support_agent_sessions')
      .select(
        'id, public_id, status, handoff_reason, assigned_operator_id, assigned_operator_email, landing_path, escalated_at, resolved_at, last_message_at, created_at',
      )
      .in('status', statuses)
      .order('escalated_at', { ascending: false, nullsFirst: false })
      .order('last_message_at', { ascending: false })
      .limit(opts.limit ?? 50)
    if (error) throw error
    return (data ?? []) as SupportInboxSession[]
  }

  async getSessionPreview(sessionId: string): Promise<string | null> {
    const { data } = await this.admin
      .from('support_agent_messages')
      .select('content, role')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data?.content as string | undefined)?.slice(0, 160) ?? null
  }

  async getMessageById(messageId: string) {
    const { data, error } = await this.admin
      .from('support_agent_messages')
      .select('id, session_id, role')
      .eq('id', messageId)
      .maybeSingle()
    if (error) throw error
    return data as { id: string; session_id: string; role: string } | null
  }

  async getInboxAnalytics(days = 7) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const [sessions, events, feedback] = await Promise.all([
      this.admin
        .from('support_agent_sessions')
        .select('id, status, created_at', { count: 'exact' })
        .gte('created_at', since),
      this.admin
        .from('support_agent_events')
        .select('event_type, payload, created_at')
        .gte('created_at', since),
      this.admin
        .from('support_agent_message_feedback')
        .select('rating')
        .gte('created_at', since),
    ])

    const sessionRows = sessions.data ?? []
    const eventRows = events.data ?? []
    const feedbackRows = feedback.data ?? []

    const handoffs = eventRows.filter((e) => e.event_type === 'handoff_requested').length
    const chats = eventRows.filter((e) => e.event_type === 'chat_completed').length
    const latencies = eventRows
      .filter((e) => e.event_type === 'chat_completed')
      .map((e) => (e.payload as { latency_ms?: number })?.latency_ms)
      .filter((n): n is number => typeof n === 'number')

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null

    const thumbsUp = feedbackRows.filter((f) => f.rating === 1).length
    const thumbsDown = feedbackRows.filter((f) => f.rating === -1).length

    return {
      period_days: days,
      sessions_started: sessionRows.length,
      chats_completed: chats,
      handoffs: handoffs,
      handoff_rate: chats > 0 ? Math.round((handoffs / chats) * 1000) / 10 : 0,
      avg_latency_ms: avgLatencyMs,
      feedback_up: thumbsUp,
      feedback_down: thumbsDown,
      queued: sessionRows.filter((s) => s.status === 'queued').length,
      human_active: sessionRows.filter((s) => s.status === 'human_active').length,
      resolved: sessionRows.filter((s) => s.status === 'resolved').length,
    }
  }

  async touchVisitorSeen(sessionId: string) {
    await this.admin
      .from('support_agent_sessions')
      .update({ visitor_last_seen_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  async listMessages(sessionId: string, limit = 40) {
    const { data, error } = await this.admin
      .from('support_agent_messages')
      .select('id, role, content, citation_sources, metadata, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) return rows

    const messageIds = rows.map((r) => r.id as string)
    const { data: feedbackRows } = await this.admin
      .from('support_agent_message_feedback')
      .select('message_id, rating')
      .in('message_id', messageIds)

    const ratingByMessage = new Map(
      (feedbackRows ?? []).map((f) => [f.message_id as string, f.rating as -1 | 1]),
    )

    return rows.map((row) => ({
      ...row,
      feedback_rating: ratingByMessage.get(row.id as string) ?? null,
    }))
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

  async adminResetSessionToBot(sessionId: string) {
    const { error } = await this.admin
      .from('support_agent_sessions')
      .update({
        status: 'bot',
        handoff_reason: null,
        assigned_operator_id: null,
        assigned_operator_email: null,
        escalated_at: null,
        resolved_at: null,
      })
      .eq('id', sessionId)
    if (error) throw error
  }
}
