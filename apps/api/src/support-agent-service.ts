import type { SupabaseAuthConfig } from './auth.js'
import {
  SupportAgentStore,
  type SupportAgentConfig,
  type SupportCitation,
  type SupportKbChunkMatch,
} from './support-agent-store.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const SALES_INTENT_RE =
  /\b(pric(e|ing)|plan|buy|purchase|enterprise|pilot|demo|sales|quote|cost|subscription|trial)\b/i

function detectSalesIntent(message: string): boolean {
  return SALES_INTENT_RE.test(message)
}

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
  if (!chunks.length) return '(No knowledge base matches yet — answer from general Sanctum positioning only.)'
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
    'When citing, mention the article or doc title and include the URL if present.',
    'Keep replies concise (2–4 short paragraphs max). Use markdown links for URLs.',
    'If the KB lacks an answer, say so and suggest /docs or /contact — do not invent details.',
    '',
    'Knowledge base excerpts:',
    context,
  ].join('\n')
}

function fitEmbeddingVector(vec: number[], targetDims: number): number[] {
  if (vec.length === targetDims) return vec
  // Nemotron free model outputs 2048 dims (MRL); slice + L2-normalize for our vector(1536) column.
  const sliced = vec.slice(0, targetDims)
  let sumSq = 0
  for (const v of sliced) sumSq += v * v
  const norm = Math.sqrt(sumSq)
  if (!norm) return sliced
  return sliced.map((v) => v / norm)
}

async function embedQuery(
  apiKey: string,
  model: string,
  text: string,
  targetDims: number,
): Promise<number[] | null> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.sanctumruntime.com',
      'X-Title': 'Sanctum Guide',
    },
    body: JSON.stringify({ model, input: text }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: { embedding?: number[] }[] }
  const raw = json.data?.[0]?.embedding
  if (!raw?.length) return null
  return fitEmbeddingVector(raw, targetDims)
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

function fallbackReply(message: string, citations: SupportCitation[]): string {
  const citeBlock =
    citations.length > 0
      ? `\n\n**Related:**\n${citations
          .slice(0, 3)
          .map((c) => (c.url ? `- [${c.title}](${c.url})` : `- ${c.title}`))
          .join('\n')}`
      : '\n\nBrowse [docs](https://www.sanctumruntime.com/docs) or [contact us](https://www.sanctumruntime.com/contact).'

  return (
    `Thanks for your question about Sanctum Runtime. I'm syncing our knowledge base — ` +
    `for now, here's a quick pointer:\n\n` +
    `Sanctum is the **runtime trust boundary** for AI agents: verify tool calls before execution, ` +
    `pause for human approval, issue signed action tokens, and keep audit evidence.\n\n` +
    `Your question: "${message.slice(0, 200)}"` +
    citeBlock
  )
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

    if (apiKey) {
      const embedding = await embedQuery(
        apiKey,
        openrouter.embedding_model,
        message,
        openrouter.embedding_dimensions,
      )
      if (embedding?.length) {
        const vectorMatches = await this.store.matchKbChunks(embedding, {
          match_count: retrieval.match_count,
          match_threshold: retrieval.match_threshold,
          filter_source_types: salesIntent
            ? [...retrieval.conversion_source_types, ...retrieval.educational_source_types]
            : retrieval.educational_source_types,
          min_sales_weight: salesIntent ? retrieval.sales_intent_min_weight : null,
        })
        if (vectorMatches.length) return vectorMatches
      }
    }

    return this.store.searchKbByText(message, retrieval.match_count)
  }

  async handleChat(input: {
    sessionPublicId: string
    message: string
  }): Promise<{
    reply: { id: string; role: string; content: string; citation_sources: SupportCitation[]; created_at: string }
    citations: SupportCitation[]
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
    const citations = chunksToCitations(chunks)
    const context = buildContextBlock(chunks)

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
        assistantContent = completion.content
        model = config.openrouter.chat_model
        tokenUsage = completion.usage
      } else {
        assistantContent = fallbackReply(trimmed, citations)
      }
    } else {
      assistantContent = fallbackReply(trimmed, citations)
    }

    const reply = await this.store.addMessage({
      session_id: session.id,
      role: 'assistant',
      content: assistantContent,
      citation_chunk_ids: chunks.map((c) => c.chunk_id).filter((id) => !id.startsWith('text-')),
      citation_sources: citations,
      model,
      token_usage: tokenUsage,
    })

    return {
      reply: {
        id: reply.id,
        role: reply.role,
        content: reply.content as string,
        citation_sources: (reply.citation_sources as SupportCitation[]) ?? [],
        created_at: reply.created_at as string,
      },
      citations,
    }
  }
}
