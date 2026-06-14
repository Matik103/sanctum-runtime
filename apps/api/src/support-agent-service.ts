import type { SupabaseAuthConfig } from './auth.js'
import {
  detectSalesIntent,
  detectHumanHandoffIntent,
  detectPlanTier,
  enterprisePricingSummary,
  filterChunksForReply,
  planComparisonSummary,
  planSectionFromChunk,
  pricingSummaryFromChunk,
  rankChunksForQuery,
  wantsCheapestPlanAnswer,
} from './support-agent-retrieval.js'
import { embedTexts } from './support-embeddings.js'
import {
  SupportAgentStore,
  type SupportAgentConfig,
  type SupportCitation,
  type SupportHandoff,
  type SupportKbChunkMatch,
} from './support-agent-store.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

function chunksToCitations(chunks: SupportKbChunkMatch[]): SupportCitation[] {
  const seen = new Set<string>()
  const out: SupportCitation[] = []
  for (const c of chunks) {
    if (seen.has(c.source_slug)) continue
    seen.add(c.source_slug)
    out.push({
      slug: c.source_slug,
      title: c.source_title,
      url: c.canonical_url,
      chunk_id: c.chunk_id,
    })
  }
  return out
}

function buildContextBlock(chunks: SupportKbChunkMatch[]): string {
  if (!chunks.length) return '(No reliable knowledge base matches for this question.)'
  return chunks
    .map((c, i) => {
      const url = c.canonical_url ? ` | ${c.canonical_url}` : ''
      return `[${i + 1}] ${c.source_title} (${c.source_type})${url}\n${c.content}`
    })
    .join('\n\n---\n\n')
}

function buildSystemPrompt(config: SupportAgentConfig, context: string): string {
  const { persona } = config
  return [
    `You are ${persona.name}, the visitor support agent for Sanctum Runtime (sanctumruntime.com).`,
    `Tone: ${persona.tone}`,
    '',
    'Goals:',
    ...persona.goals.map((g) => `- ${g}`),
    '',
    'Never:',
    ...persona.never.map((n) => `- ${n}`),
    '',
    'Use ONLY the knowledge base excerpts below for product facts, pricing, and feature claims.',
    'If excerpts do not directly support the answer, say what is missing and offer a human handoff.',
    'Do not include internal model names, provider names, implementation guesses, IDs, keys, database details, or stack traces unless the excerpts explicitly say to.',
    'When citing, mention the article or doc title and include the URL if present.',
    'Keep replies concise: answer first, then one concrete next step. Use markdown links for URLs.',
    'If the visitor is frustrated, asks for a human, asks for a pilot, or needs account-specific help, acknowledge it and route them to contact.',
    '',
    'Knowledge base excerpts:',
    context,
  ].join('\n')
}

async function embedQuery(
  apiKey: string,
  model: string,
  text: string,
  targetDims: number,
): Promise<number[] | null> {
  const [embedding] = await embedTexts(apiKey, model, [text], targetDims)
  return embedding
}

async function chatCompletion(
  apiKey: string,
  model: string,
  temperature: number,
  messages: { role: string; content: string }[],
): Promise<{ content: string; usage: Record<string, unknown> } | null> {
  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.sanctumruntime.com',
      'X-Title': 'Sanctum Guide',
    },
    body: JSON.stringify({ model, temperature, messages }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: Record<string, unknown>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) return null
  return { content, usage: json.usage ?? {} }
}

function mergeChunks(...lists: SupportKbChunkMatch[][]): SupportKbChunkMatch[] {
  const seen = new Set<string>()
  const out: SupportKbChunkMatch[] = []
  for (const list of lists) {
    for (const c of list) {
      const key = c.chunk_id.startsWith('text-') ? c.source_slug : c.chunk_id
      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

function supportHandoff(input: {
  message: string
  chunks: SupportKbChunkMatch[]
  salesIntent: boolean
}): SupportHandoff | null {
  const requested = detectHumanHandoffIntent(input.message)
  const lowConfidence = input.chunks.length === 0 || input.chunks.every((c) => c.similarity < 0.62)
  if (!requested && !lowConfidence) return null

  const sales = input.salesIntent && /\b(sales|pilot|demo|enterprise|quote|call)\b/i.test(input.message)
  return {
    recommended: true,
    reason: requested ? (sales ? 'sales' : 'requested') : 'low_confidence',
    label: sales ? 'Talk to sales' : 'Connect to a human',
    url: sales ? 'https://www.sanctumruntime.com/enterprise' : 'https://www.sanctumruntime.com/contact',
    email: sales ? 'sales@sanctumruntime.com' : 'support@sanctumruntime.com',
  }
}

function appendHandoff(content: string, handoff: SupportHandoff | null): string {
  if (!handoff?.recommended) return content
  const line =
    handoff.reason === 'low_confidence'
      ? `I do not have enough matching Sanctum knowledge-base context to answer that confidently.`
      : `If you want a person to take this from here, I can route you to the team.`
  return `${content}\n\n${line} [${handoff.label}](${handoff.url}) or email ${handoff.email}.`
}

function composeFromChunks(
  message: string,
  chunks: SupportKbChunkMatch[],
  citations: SupportCitation[],
): string {
  const top = filterChunksForReply(message, chunks)
  const pricingChunk = top.find((c) => c.source_type === 'pricing')
  const planTier = detectPlanTier(message)
  const comparisonLead =
    /\bcompare\b/i.test(message) && /\b(observer|operator|personal|team)\b/i.test(message) && pricingChunk
      ? planComparisonSummary(pricingChunk.content)
      : null
  const planTierLead =
    !comparisonLead && planTier && pricingChunk
      ? planSectionFromChunk(pricingChunk.content, planTier)
      : null
  const enterpriseLead =
    !comparisonLead && !planTierLead && /\benterprise\b/i.test(message) && pricingChunk
      ? enterprisePricingSummary(pricingChunk.content)
      : null
  const pricingLead =
    !comparisonLead && !planTierLead && !enterpriseLead && wantsCheapestPlanAnswer(message) && pricingChunk
      ? pricingSummaryFromChunk(pricingChunk.content)
      : null

  const pricingIntro = comparisonLead ?? (planTierLead ? `**${planTier} plan:**\n\n${planTierLead}` : null)

  const intro = pricingIntro
    ? pricingIntro
    : enterpriseLead
      ? enterpriseLead
      : pricingLead
        ? pricingLead
        : detectSalesIntent(message) && pricingChunk
          ? 'Here is our pricing overview:'
          : top[0]?.source_type === 'pricing'
            ? 'Here is what our pricing page says:'
            : 'Based on our knowledge base:'

  const bodyChunks = pricingIntro || enterpriseLead || pricingLead
    ? top.filter((c) => c.source_type !== 'pricing').slice(0, 2)
    : top.slice(0, 3)

  const body = bodyChunks
    .map((c) => {
      const link = c.canonical_url ? ` [Read more](${c.canonical_url})` : ''
      return `**${c.source_title}**${link}\n${c.content.slice(0, 550)}`
    })
    .join('\n\n')

  const citeList = chunksToCitations(top).slice(0, 3)
  const citeExtra =
    citeList.length > 0
      ? `\n\n**Sources:** ${citeList
          .map((c) => (c.url ? `[${c.title}](${c.url})` : c.title))
          .join(' · ')}`
      : citations.length > 0
        ? `\n\n**Sources:** ${citations
            .slice(0, 3)
            .map((c) => (c.url ? `[${c.title}](${c.url})` : c.title))
            .join(' · ')}`
        : ''

  return body ? `${intro}\n\n${body}${citeExtra}` : `${intro}${citeExtra}`
}

function fallbackReply(message: string, citations: SupportCitation[], chunks: SupportKbChunkMatch[], handoff?: SupportHandoff | null): string {
  if (chunks.length) return composeFromChunks(message, chunks, citations)
  const citeBlock =
    citations.length > 0
      ? `\n\n**Related:**\n${citations
          .slice(0, 3)
          .map((c) => (c.url ? `- [${c.title}](${c.url})` : `- ${c.title}`))
          .join('\n')}`
      : '\n\nBrowse [docs](https://www.sanctumruntime.com/docs) or [contact us](https://www.sanctumruntime.com/contact).'

  const base = (
    `I do not have a strong knowledge-base match for that exact question yet.\n\n` +
    `What I can say safely: Sanctum is the **runtime trust boundary** for AI agents. It verifies tool calls before execution, can pause risky actions for human approval, issues signed action tokens, and keeps audit evidence.\n\n` +
    `Your question: "${message.slice(0, 200)}"` +
    citeBlock
  )
  return appendHandoff(base, handoff ?? null)
}

function resolveOpenRouterApiKey(config: SupportAgentConfig): string | null {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const fromConfig = config.openrouter.api_key?.trim()
  return fromConfig || null
}

export class SupportAgentService {
  private store: SupportAgentStore

  constructor(cfg: SupabaseAuthConfig) {
    this.store = new SupportAgentStore(cfg)
  }

  async retrieveChunks(message: string, config: SupportAgentConfig): Promise<SupportKbChunkMatch[]> {
    const salesIntent = detectSalesIntent(message)
    const apiKey = resolveOpenRouterApiKey(config)
    const { retrieval, openrouter } = config
    const limit = retrieval.match_count

    const textMatches = await this.store.searchKbByText(message, limit)
    let vectorMatches: SupportKbChunkMatch[] = []

    if (apiKey) {
      const embedding = await embedQuery(
        apiKey,
        openrouter.embedding_model,
        message,
        openrouter.embedding_dimensions,
      )
      if (embedding?.length) {
        const types = salesIntent
          ? [...retrieval.conversion_source_types, ...retrieval.educational_source_types]
          : [...retrieval.educational_source_types, ...retrieval.conversion_source_types]

        vectorMatches = await this.store.matchKbChunks(embedding, {
          match_count: limit,
          match_threshold: retrieval.match_threshold,
          filter_source_types: types,
          min_sales_weight: salesIntent ? retrieval.sales_intent_min_weight : null,
        })

        if (!vectorMatches.length && salesIntent) {
          vectorMatches = await this.store.matchKbChunks(embedding, {
            match_count: limit,
            match_threshold: Math.min(retrieval.match_threshold, 0.6),
            filter_source_types: types,
            min_sales_weight: null,
          })
        }

        if (!vectorMatches.length) {
          vectorMatches = await this.store.matchKbChunks(embedding, {
            match_count: limit,
            match_threshold: Math.min(retrieval.match_threshold, 0.6),
            filter_source_types: null,
            min_sales_weight: null,
          })
        }
      }
    }

    return rankChunksForQuery(message, mergeChunks(vectorMatches, textMatches)).slice(0, limit)
  }

  async handleChat(input: {
    sessionPublicId: string
    message: string
  }): Promise<{
    reply: {
      id: string
      role: string
      content: string
      citation_sources: SupportCitation[]
      handoff: SupportHandoff | null
      created_at: string
    }
    citations: SupportCitation[]
    handoff: SupportHandoff | null
  }> {
    const session = await this.store.getSessionByPublicId(input.sessionPublicId)
    if (!session) throw new Error('session_not_found')

    const trimmed = input.message.trim()
    if (!trimmed || trimmed.length > 4000) throw new Error('invalid_message')

    await this.store.addMessage({
      session_id: session.id,
      role: 'user',
      content: trimmed,
    })

    const config = await this.store.loadConfig()
    const chunks = await this.retrieveChunks(trimmed, config)
    const replyChunks = filterChunksForReply(trimmed, chunks)
    const citations = chunksToCitations(replyChunks.length ? replyChunks : chunks)
    const context = buildContextBlock(replyChunks.length ? replyChunks : chunks)
    const salesIntent = detectSalesIntent(trimmed)
    const handoff = supportHandoff({ message: trimmed, chunks: replyChunks.length ? replyChunks : chunks, salesIntent })

    const history = await this.store.listMessages(session.id, 12)
    const prior = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content as string }))

    const apiKey = resolveOpenRouterApiKey(config)
    let assistantContent: string
    let model: string | undefined
    let tokenUsage: Record<string, unknown> = {}

    if (apiKey) {
      const completion = await chatCompletion(
        apiKey,
        config.openrouter.chat_model,
        config.openrouter.temperature,
        [
          { role: 'system', content: buildSystemPrompt(config, context) },
          ...prior,
          { role: 'user', content: trimmed },
        ],
      )
      if (completion) {
        assistantContent = appendHandoff(completion.content, handoff)
        model = config.openrouter.chat_model
        tokenUsage = completion.usage
      } else {
        assistantContent = chunks.length
          ? composeFromChunks(trimmed, chunks, citations)
          : fallbackReply(trimmed, citations, chunks, handoff)
      }
    } else {
      assistantContent = chunks.length
        ? composeFromChunks(trimmed, chunks, citations)
        : fallbackReply(trimmed, citations, chunks, handoff)
    }

    assistantContent = appendHandoff(assistantContent, handoff && !assistantContent.includes(handoff.url) ? handoff : null)

    const reply = await this.store.addMessage({
      session_id: session.id,
      role: 'assistant',
      content: assistantContent,
      citation_chunk_ids: chunks.map((c) => c.chunk_id).filter((id) => !id.startsWith('text-')),
      citation_sources: citations,
      model,
      token_usage: tokenUsage,
      metadata: {
        handoff,
        retrieval: {
          matched_chunks: chunks.length,
          reply_chunks: replyChunks.length,
          top_similarity: chunks[0]?.similarity ?? null,
        },
      },
    })

    return {
      reply: {
        id: reply.id,
        role: reply.role,
        content: reply.content as string,
        citation_sources: (reply.citation_sources as SupportCitation[]) ?? [],
        handoff,
        created_at: reply.created_at as string,
      },
      citations,
      handoff,
    }
  }
}
