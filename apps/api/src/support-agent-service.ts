import type { SupabaseAuthConfig } from './auth.js'
import {
  detectSalesIntent,
  detectHumanHandoffIntent,
  detectPlanTier,
  enterprisePricingSummary,
  filterChunksForReply,
  isGeneralHelpQuery,
  isGreeting,
  planComparisonSummary,
  planSectionFromChunk,
  pricingSummaryFromChunk,
  rankChunksForQuery,
  shouldAutoHandoffForLowConfidence,
  wantsCheapestPlanAnswer,
} from './support-agent-retrieval.js'
import { embedTexts } from './support-embeddings.js'
import { suggestFollowUps } from './support-agent-followups.js'
import { loadInboxConfig } from './support-inbox-auth.js'
import { notifySupportHandoff } from './support-handoff-notify.js'
import {
  SupportAgentStore,
  type SupportAgentConfig,
  type SupportCitation,
  type SupportHandoff,
  type SupportKbChunkMatch,
  type SupportSessionStatus,
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
    'Conversation style:',
    '- Warm, direct, and knowledgeable — like a sharp runtime-security teammate, not a ticket router.',
    '- Lead with the answer. Use short paragraphs and bullets when they help.',
    '- Ask at most one clarifying question when the visitor goal is genuinely ambiguous.',
    '',
    'Goals:',
    ...persona.goals.map((g) => `- ${g}`),
    '',
    'Never:',
    ...persona.never.map((n) => `- ${n}`),
    '',
    'Knowledge rules:',
    '- Ground product facts, pricing, and feature claims in the KB excerpts below.',
    '- Synthesize across excerpts when needed. Connect ideas for the visitor.',
    '- If excerpts partially cover the question, answer what you can and note what is uncertain.',
    '- Do not include internal model names, provider names, implementation guesses, IDs, keys, database details, or stack traces unless excerpts explicitly include them.',
    '- When citing, mention the article or doc title and include markdown links for URLs.',
    '',
    'Format:',
    '- Plain text only — no markdown headers (#), bold (**), or italic.',
    '- Use short paragraphs and simple "Label: value" lines for lists.',
    '- Links are OK as [title](url) for citations only.',
    '- Quote pricing and limits exactly as in excerpts (Observer has no governed actions — observe only; Personal starts at 500/mo governed).',
    '',
    'Human escalation (last resort only):',
    '- Do NOT offer human contact, sales routing, or "connect to a human" unless the visitor explicitly asks for a person or needs account-specific data you cannot infer from excerpts.',
    '- Never default to contact/sales when you can give a useful answer from excerpts or general Sanctum positioning (runtime trust, verify-before-execute, MCP gates, policies, audit).',
    '- Pilot and enterprise questions: answer from KB first; suggest contact only for custom contracts or org-specific billing.',
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

async function* chatCompletionStream(
  apiKey: string,
  model: string,
  temperature: number,
  messages: { role: string; content: string }[],
): AsyncGenerator<string, { usage: Record<string, unknown> } | null, void> {
  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.sanctumruntime.com',
      'X-Title': 'Sanctum Guide',
    },
    body: JSON.stringify({ model, temperature, messages, stream: true }),
  })
  if (!res.ok || !res.body) return null

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: Record<string, unknown> = {}

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[]
          usage?: Record<string, unknown>
        }
        if (json.usage) usage = json.usage
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        /* ignore malformed SSE chunks */
      }
    }
  }
  return { usage }
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
  llmAvailable: boolean
}): SupportHandoff | null {
  if (isGreeting(input.message) || isGeneralHelpQuery(input.message)) return null

  const requested = detectHumanHandoffIntent(input.message)
  if (requested) {
    const sales =
      input.salesIntent && /\b(sales|pilot|demo|enterprise|quote|call|schedule)\b/i.test(input.message)
    return {
      recommended: true,
      reason: sales ? 'sales' : 'requested',
      label: sales ? 'Talk to sales' : 'Connect to a human',
      url: sales ? 'https://www.sanctumruntime.com/enterprise' : 'https://www.sanctumruntime.com/contact',
      email: sales ? 'sales@sanctumruntime.com' : 'support@sanctumruntime.com',
    }
  }

  // With an LLM, always try KB-grounded answers first — no automatic human routing.
  if (input.llmAvailable) return null

  if (!shouldAutoHandoffForLowConfidence(input.message, input.chunks)) return null

  return {
    recommended: true,
    reason: 'low_confidence',
    label: 'Connect to a human',
    url: 'https://www.sanctumruntime.com/contact',
    email: 'support@sanctumruntime.com',
  }
}

/** Strip markdown the chat UI does not render (headings, bold). Keeps [label](url) links. */
export function sanitizeReplyForChat(content: string): string {
  let text = content.trim()
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
  text = text.replace(/_([^_\n]+)_/g, '$1')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function greetingReply(): string {
  return sanitizeReplyForChat(
    `Hi — I'm Sanctum Guide. I can help with runtime trust, agent security, MCP hardening, pricing, and getting started.\n\n` +
      `A few things visitors often ask:\n` +
      `- What is Sanctum Runtime and how is it different from guardrails?\n` +
      `- How does verify-before-execute / human approval work?\n` +
      `- MCP security, action tokens, and policy design\n` +
      `- Plans and pricing (Observer through Enterprise)\n\n` +
      `What would you like to dig into?`,
  )
}

function generalHelpReply(): string {
  return sanitizeReplyForChat(
    `I can answer questions about Sanctum Runtime using our docs, blog, and product guides — no account needed.\n\n` +
      `Try asking about:\n` +
      `- Getting started — SDK install, console, quick start\n` +
      `- Runtime trust — verifyAction, policies, approvals, audit trails\n` +
      `- Security — MCP gates, prompt injection, SOC 2 evidence, kill switches\n` +
      `- Pricing — Observer, Operator, Team, Enterprise\n\n` +
      `What are you building or evaluating?`,
  )
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

  const pricingIntro = comparisonLead ?? (planTierLead ? `${planTier} plan:\n\n${planTierLead}` : null)

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
      return `${c.source_title}${link}\n${c.content.slice(0, 550)}`
    })
    .join('\n\n')

  const citeList = chunksToCitations(top).slice(0, 3)
  const citeExtra =
    citeList.length > 0
      ? `\n\nSources: ${citeList
          .map((c) => (c.url ? `[${c.title}](${c.url})` : c.title))
          .join(' · ')}`
      : citations.length > 0
        ? `\n\nSources: ${citations
            .slice(0, 3)
            .map((c) => (c.url ? `[${c.title}](${c.url})` : c.title))
            .join(' · ')}`
        : ''

  return sanitizeReplyForChat(body ? `${intro}\n\n${body}${citeExtra}` : `${intro}${citeExtra}`)
}

function fallbackReply(
  message: string,
  citations: SupportCitation[],
  chunks: SupportKbChunkMatch[],
  handoff?: SupportHandoff | null,
): string {
  if (chunks.length) return composeFromChunks(message, chunks, citations)
  const citeBlock =
    citations.length > 0
      ? `\n\nRelated:\n${citations
          .slice(0, 3)
          .map((c) => (c.url ? `- [${c.title}](${c.url})` : `- ${c.title}`))
          .join('\n')}`
      : '\n\nBrowse [docs](https://www.sanctumruntime.com/docs) or our [blog](https://www.sanctumruntime.com/blog).'

  const base = sanitizeReplyForChat(
    `I could not find a tight match in the knowledge base for that exact wording, but here is the safe overview:\n\n` +
      `Sanctum Runtime is the runtime trust boundary for AI agents and autonomous systems. It verifies tool calls and side effects before they execute, applies policy and risk scoring, can pause risky actions for human approval, issues signed action tokens, and keeps audit evidence operators can defend.\n\n` +
      `If you can rephrase with a bit more context (stack, use case, or action you are trying to gate), I can pull a more specific guide from our KB.${citeBlock}`,
  )

  return handoff?.recommended ? appendHandoff(base, handoff) : base
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

  getStore(): SupportAgentStore {
    return this.store
  }

  async escalateWithNotify(input: {
    sessionPublicId: string
    reason: string
    visitorMessage: string
  }): Promise<{
    status: SupportSessionStatus
    alreadyQueued: boolean
    confirmation: { id: string; content: string; created_at: string } | null
  }> {
    const session = await this.store.getSessionByPublicId(input.sessionPublicId)
    if (!session) throw new Error('session_not_found')

    const { alreadyQueued } = await this.store.escalateSession({
      session_id: session.id,
      reason: input.reason,
    })

    if (!alreadyQueued) {
      const messages = await this.store.listMessages(session.id, 20)
      const inbox = await loadInboxConfig(this.store)
      void notifySupportHandoff({
        sessionPublicId: session.public_id,
        reason: input.reason,
        visitorMessage: input.visitorMessage,
        landingPath: (session as { landing_path?: string | null }).landing_path ?? null,
        transcript: messages.map((m) => ({
          role: m.role as string,
          content: m.content as string,
          created_at: m.created_at as string,
        })),
        inbox,
        consoleBaseUrl: process.env.VITE_CONSOLE_URL ?? process.env.CONSOLE_URL,
      })
    }

    const confirmationRow = await this.store.addQueueConfirmation(session.id)
    return {
      status: 'queued',
      alreadyQueued,
      confirmation: confirmationRow
        ? {
            id: confirmationRow.id as string,
            content: confirmationRow.content as string,
            created_at: confirmationRow.created_at as string,
          }
        : null,
    }
  }

  private async saveAssistantReply(input: {
    session: {
      id: string
      public_id: string
      landing_path?: string | null
      status?: SupportSessionStatus
    }
    trimmed: string
    assistantContent: string
    chunks: SupportKbChunkMatch[]
    replyChunks: SupportKbChunkMatch[]
    citations: SupportCitation[]
    handoff: SupportHandoff | null
    model?: string
    tokenUsage?: Record<string, unknown>
    latencyMs: number
  }) {
    const followUps = suggestFollowUps(input.trimmed, input.assistantContent, input.handoff)

    const reply = await this.store.addMessage({
      session_id: input.session.id,
      role: 'assistant',
      content: input.assistantContent,
      citation_chunk_ids: input.chunks.map((c) => c.chunk_id).filter((id) => !id.startsWith('text-')),
      citation_sources: input.citations,
      model: input.model,
      token_usage: input.tokenUsage ?? {},
      metadata: {
        handoff: input.handoff,
        follow_ups: followUps,
        retrieval: {
          matched_chunks: input.chunks.length,
          reply_chunks: input.replyChunks.length,
          top_similarity: input.chunks[0]?.similarity ?? null,
        },
      },
    })

    if (input.handoff?.recommended) {
      const autoQueue =
        input.handoff.reason === 'requested' || input.handoff.reason === 'sales'
      if (autoQueue) {
        const { alreadyQueued } = await this.store.escalateSession({
          session_id: input.session.id,
          reason: input.handoff.reason,
        })
        if (!alreadyQueued) {
          const messages = await this.store.listMessages(input.session.id, 20)
          const inbox = await loadInboxConfig(this.store)
          void notifySupportHandoff({
            sessionPublicId: input.session.public_id,
            reason: input.handoff.reason,
            visitorMessage: input.trimmed,
            landingPath: input.session.landing_path ?? null,
            transcript: messages.map((m) => ({
              role: m.role as string,
              content: m.content as string,
              created_at: m.created_at as string,
            })),
            inbox,
            consoleBaseUrl: process.env.VITE_CONSOLE_URL ?? process.env.CONSOLE_URL,
          })
        }
      }
    }

    await this.store.recordEvent({
      session_id: input.session.id,
      message_id: reply.id as string,
      event_type: 'chat_completed',
      payload: {
        latency_ms: input.latencyMs,
        matched_chunks: input.chunks.length,
        handoff: Boolean(input.handoff?.recommended),
        model: input.model ?? null,
      },
    })

    return { reply, followUps }
  }

  private formatReply(
    reply: { id: unknown; role: unknown; content: unknown; citation_sources: unknown; metadata: unknown; created_at: unknown },
    handoff: SupportHandoff | null,
    followUps: string[],
    sessionStatus: SupportSessionStatus,
  ) {
    const meta = (reply.metadata ?? {}) as { follow_ups?: string[] }
    return {
      reply: {
        id: reply.id as string,
        role: reply.role as string,
        content: reply.content as string,
        citation_sources: (reply.citation_sources as SupportCitation[]) ?? [],
        handoff,
        follow_ups: meta.follow_ups ?? followUps,
        created_at: reply.created_at as string,
      },
      citations: (reply.citation_sources as SupportCitation[]) ?? [],
      handoff,
      follow_ups: meta.follow_ups ?? followUps,
      session_status: sessionStatus,
    }
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
  }) {
    const started = Date.now()
    const session = await this.store.getSessionByPublicId(input.sessionPublicId)
    if (!session) throw new Error('session_not_found')

    const trimmed = input.message.trim()
    if (!trimmed || trimmed.length > 4000) throw new Error('invalid_message')

    const status = (session.status ?? 'bot') as SupportSessionStatus
    if (status === 'resolved') {
      await this.store.adminResetSessionToBot(session.id)
    }

    await this.store.addMessage({
      session_id: session.id,
      role: 'user',
      content: trimmed,
    })
    await this.store.touchVisitorSeen(session.id)

    const currentStatus = ((await this.store.getSessionByPublicId(input.sessionPublicId))?.status ??
      'bot') as SupportSessionStatus

    if (currentStatus === 'human_active') {
      return {
        reply: null,
        citations: [],
        handoff: null,
        follow_ups: [],
        session_status: currentStatus,
      }
    }

    if (currentStatus === 'queued') {
      const history = await this.store.listMessages(session.id, 4)
      const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')
      const alreadyNotified =
        lastAssistant &&
        (lastAssistant.content as string).includes('in the queue')

      if (!alreadyNotified) {
        const queueReply = sanitizeReplyForChat(
          'You are in the queue — a Sanctum teammate will join this chat shortly. You can keep typing; they will see your messages.',
        )
        const followUps = ['Request urgent help']
        const reply = await this.store.addMessage({
          session_id: session.id,
          role: 'assistant',
          content: queueReply,
          metadata: { handoff: null, follow_ups: followUps, sender: 'system' },
        })
        return this.formatReply(reply, null, followUps, 'queued')
      }

      return {
        reply: null,
        citations: [],
        handoff: null,
        follow_ups: [],
        session_status: 'queued' as SupportSessionStatus,
      }
    }

    const config = await this.store.loadConfig()
    const apiKey = resolveOpenRouterApiKey(config)
    const llmAvailable = Boolean(apiKey)

    if (isGreeting(trimmed)) {
      const assistantContent = greetingReply()
      const followUps = suggestFollowUps(trimmed, assistantContent, null)
      const reply = await this.store.addMessage({
        session_id: session.id,
        role: 'assistant',
        content: assistantContent,
        citation_chunk_ids: [],
        citation_sources: [],
        metadata: {
          handoff: null,
          follow_ups: followUps,
          retrieval: { matched_chunks: 0, reply_chunks: 0, top_similarity: null },
        },
      })
      await this.store.recordEvent({
        session_id: session.id,
        message_id: reply.id as string,
        event_type: 'chat_completed',
        payload: { latency_ms: Date.now() - started, matched_chunks: 0, handoff: false },
      })
      return this.formatReply(reply, null, followUps, 'bot')
    }

    if (isGeneralHelpQuery(trimmed)) {
      const assistantContent = generalHelpReply()
      const followUps = suggestFollowUps(trimmed, assistantContent, null)
      const reply = await this.store.addMessage({
        session_id: session.id,
        role: 'assistant',
        content: assistantContent,
        citation_chunk_ids: [],
        citation_sources: [],
        metadata: {
          handoff: null,
          follow_ups: followUps,
          retrieval: { matched_chunks: 0, reply_chunks: 0, top_similarity: null },
        },
      })
      await this.store.recordEvent({
        session_id: session.id,
        message_id: reply.id as string,
        event_type: 'chat_completed',
        payload: { latency_ms: Date.now() - started, matched_chunks: 0, handoff: false },
      })
      return this.formatReply(reply, null, followUps, 'bot')
    }

    const chunks = await this.retrieveChunks(trimmed, config)
    const replyChunks = filterChunksForReply(trimmed, chunks)
    const citations = chunksToCitations(replyChunks.length ? replyChunks : chunks)
    const context = buildContextBlock(replyChunks.length ? replyChunks : chunks)
    const salesIntent = detectSalesIntent(trimmed)
    const handoff = supportHandoff({
      message: trimmed,
      chunks: replyChunks.length ? replyChunks : chunks,
      salesIntent,
      llmAvailable,
    })

    const history = await this.store.listMessages(session.id, 12)
    const prior = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content as string }))

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
        assistantContent = chunks.length
          ? composeFromChunks(trimmed, chunks, citations)
          : fallbackReply(trimmed, citations, chunks, handoff)
      }
    } else {
      assistantContent = chunks.length
        ? composeFromChunks(trimmed, chunks, citations)
        : fallbackReply(trimmed, citations, chunks, handoff)
    }

    if (handoff?.recommended) {
      assistantContent = appendHandoff(assistantContent, handoff)
    }

    assistantContent = sanitizeReplyForChat(assistantContent)

    const { reply, followUps } = await this.saveAssistantReply({
      session: {
        id: session.id,
        public_id: session.public_id,
        landing_path: (session as { landing_path?: string | null }).landing_path,
        status: currentStatus,
      },
      trimmed,
      assistantContent,
      chunks,
      replyChunks,
      citations,
      handoff,
      model,
      tokenUsage,
      latencyMs: Date.now() - started,
    })

    const autoQueued =
      handoff?.recommended &&
      (handoff.reason === 'requested' || handoff.reason === 'sales')
    const sessionStatus = autoQueued ? 'queued' : 'bot'
    return this.formatReply(reply, handoff, followUps, sessionStatus)
  }

  async handleChatStream(
    input: { sessionPublicId: string; message: string },
    onEvent: (event: string, data: Record<string, unknown>) => void,
  ) {
    const started = Date.now()
    const result = await this.handleChat(input).catch(async (err) => {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'session_not_found' || msg === 'invalid_message') throw err
      throw err
    })

    if (!result.reply) {
      onEvent('done', { session_status: result.session_status })
      return result
    }

    const content = result.reply.content
    const chunkSize = Math.max(12, Math.floor(content.length / 24))
    for (let i = 0; i < content.length; i += chunkSize) {
      onEvent('token', { text: content.slice(i, i + chunkSize) })
    }

    onEvent('done', {
      message: result.reply,
      citations: result.citations,
      handoff: result.handoff,
      follow_ups: result.follow_ups,
      session_status: result.session_status,
    })
    void started
    return result
  }
}
