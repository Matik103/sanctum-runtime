import type { SupportKbChunkMatch } from './support-agent-store.js'

export const SALES_INTENT_RE =
  /\b(pric(e|ing)|plan|buy|purchase|enterprise|pilot|demo|sales|quote|cost|subscription|trial|cheap|cheapest|free|compare)\b/i

const STOP_WORDS = new Set([
  'what',
  'how',
  'does',
  'the',
  'and',
  'for',
  'with',
  'your',
  'this',
  'that',
  'are',
  'can',
  'you',
  'use',
  'its',
  'from',
  'when',
  'why',
  'who',
  'where',
  'will',
  'have',
  'has',
  'was',
  'were',
  'been',
  'being',
  'into',
  'about',
  'want',
  'need',
  'tell',
  'explain',
  'please',
  'work',
  'works',
  'doing',
  'mean',
  'like',
])

const CONVERSION_TYPES = new Set(['pricing', 'product', 'comparison', 'sales_playbook'])
const EDUCATIONAL_TYPES = new Set(['blog', 'docs', 'faq', 'glossary'])

export function detectSalesIntent(message: string): boolean {
  const m = message.toLowerCase()
  // Agent commerce / safety questions — not Sanctum pricing intent
  if (/\b(can|how)\s+(?:ai\s+)?agents?\s+buy\b/i.test(message)) return false
  if (/\bbuy\s+(things|online|safely|stuff)\b/i.test(m)) return false
  // "buy" without product/pricing context (e.g. "buyers guide" still has buy in SALES)
  if (/\bbuy\b/i.test(m) && !/\b(pricing|plan|observer|operator|personal|team|enterprise|subscription|sanctum|trial)\b/i.test(m)) {
    return false
  }
  return SALES_INTENT_RE.test(message)
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/-/g, ' ')
}

export function extractSearchTerms(query: string, salesIntent: boolean): string[] {
  const raw = normalizeQuery(query)
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))

  const phrases = extractPhrases(query)
  if (salesIntent) {
    return [...new Set([...raw, ...phrases, 'pricing', 'plan', 'observer'])]
  }
  return [...new Set([...raw, ...phrases])]
}

export function extractPhrases(query: string): string[] {
  const words = normalizeQuery(query)
    .split(/\W+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  const phrases: string[] = []
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`)
  }
  return phrases
}

export const CHEAPEST_INTENT_RE =
  /\b(cheap|cheapest|free|lowest|observer|beginner|hobby|indie)\b/i

/** Explicit visitor request for a person — not product vocabulary (plans, MCP, support features). */
const EXPLICIT_HANDOFF_PATTERNS: RegExp[] = [
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|someone|real\s+person|representative)\b/i,
  /\b(get|reach|connect)\s+(me\s+)?(to|with)\s+(a\s+)?(human|person|sales\s+team|support\s+team)\b/i,
  /\b(want|need)\s+(to\s+)?(talk|speak)\s+(to|with)\s+(a\s+)?(human|person|sales|someone)\b/i,
  /\b(talk|speak)\s+to\s+(sales|founder|an?\s+engineer)\b/i,
  /\bschedule\s+(a\s+)?(demo|call|meeting)\b/i,
  /\b(book|request)\s+(a\s+)?(demo|pilot)\b/i,
  /\b(escalate|transfer)\b/i,
  /\bconnect\s+me\b/i,
  /\bhuman\s+(please|agent|rep)\b/i,
  /\bnot\s+(helpful|satisfied|working)\b/i,
  /\bdoesn'?t\s+help\b/i,
  /\bstill\s+need\s+(a\s+)?(human|person)\b/i,
  /\blet\s+me\s+talk\s+to\b/i,
  /\btalk\s+to\s+sales\b/i,
]

export function isGreeting(message: string): boolean {
  const m = message.trim()
  return /^(hi|hello|hey|howdy|yo|good\s+(morning|afternoon|evening))[\s!.?]*$/i.test(m)
}

export function isGeneralHelpQuery(message: string): boolean {
  return /\b(what can you (do|help with)|how can you help|help me|need help)\b/i.test(message.trim())
}

export function detectHumanHandoffIntent(message: string): boolean {
  const m = message.trim()
  if (!m) return false

  // Product/pricing questions — never treat plan names or feature "support" as escalation.
  if (detectPlanTier(m)) return false
  if (
    /\b(how much|price|cost|pricing|plan|observer|operator|personal|team|enterprise)\b/i.test(m) &&
    !/\b(talk|speak|human|person|connect\s+me|schedule)\b/i.test(m)
  ) {
    return false
  }
  if (/\b(priority|technical)\s+support\b/i.test(m)) return false
  if (/\b(send|verify|agent).*\b(email|contact)\b/i.test(m)) return false
  if (/\b(email|contact).*\b(agent|approval|verify)\b/i.test(m)) return false

  return EXPLICIT_HANDOFF_PATTERNS.some((re) => re.test(m))
}

/** Auto handoff only when retrieval is empty on a substantive question (no-LLM fallback path). */
export function shouldAutoHandoffForLowConfidence(
  message: string,
  chunks: SupportKbChunkMatch[],
): boolean {
  if (isGreeting(message) || isGeneralHelpQuery(message)) return false
  if (chunks.length > 0) return false
  const terms = extractSearchTerms(message, detectSalesIntent(message))
  return terms.length >= 2
}

export function wantsCheapestPlanAnswer(message: string): boolean {
  if (/\benterprise\b/i.test(message)) return false
  return (
    CHEAPEST_INTENT_RE.test(message) ||
    /\bwhat(?:'s| is) the (?:cheapest|lowest|best free)\b/i.test(message)
  )
}

/** High-confidence KB slugs for common phrases (text-search boost). */
const TOPIC_HINTS: { pattern: RegExp; slugs: string[] }[] = [
  { pattern: /\baction\s+tokens?\b/i, slugs: ['blog/signed-action-tokens-executor-verification', 'product/overview'] },
  { pattern: /\bmcp\b/i, slugs: ['blog/mcp-server-action-gate', 'blog/mcp-server-security-checklist-2026'] },
  { pattern: /\benterprise\b.*\b(pric|plan|cost)\b|\b(pric|plan|cost)\b.*\benterprise\b/i, slugs: ['page/pricing', 'product/overview'] },
  { pattern: /\bguardrails?\b/i, slugs: ['blog/runtime-authorization-vs-guardrails-explained', 'blog/sanctum-vs-guardrails', 'blog/sanctum-vs-guardrails-only-stack'] },
  { pattern: /\b(install|npm|quick\s*start)\b.*\bsdk\b|\bsdk\b.*\b(install|npm)\b/i, slugs: ['docs/index'] },
  { pattern: /\bverify\s*action\b/i, slugs: ['docs/index', 'blog/ai-agent-action-approval-before-execution'] },
  { pattern: /\bhuman[\s-]*in[\s-]*the[\s-]*loop\b|\bhitl\b/i, slugs: ['blog/what-is-human-in-the-loop-for-ai-agents', 'blog/ai-agent-action-approval-before-execution'] },
  { pattern: /\b(can|how)\s+.+\s+buy\b|\bbuy\s+(things|online|safely)\b/i, slugs: ['blog/can-ai-agents-buy-online-safely'] },
  { pattern: /\bsoc\s*2\b|\bsoc2\b/i, slugs: ['blog/can-ai-agents-be-soc2-compliant', 'blog/soc2-nist-ai-rmf-runtime-evidence', 'blog/get-soc2-ready-ai-agent-controls-in-days'] },
  { pattern: /\bkill\s*switch\b|\bstop\s*button\b/i, slugs: ['blog/ai-agent-kill-switch-best-practices', 'blog/fleet-kill-switch-autonomous-systems', 'blog/ai-agent-stop-button-design'] },
  { pattern: /\bros2\b|\brobotics?\b|\bembodied\b/i, slugs: ['blog/ros2-safety-policy-runtime', 'blog/embodied-ai-robotics-policy-gate'] },
  { pattern: /\bget\s+(started|going)\b|\bquick\s*start\b/i, slugs: ['docs/index', 'product/overview', 'blog/introducing-sanctum-runtime', 'blog/sanctum-runtime-free-trial-get-started'] },
  { pattern: /\bwhere\s+is\s+the\s+console\b|\bconsole\s+url\b/i, slugs: ['product/overview', 'docs/index'] },
  { pattern: /\bobservability\s+(vs|versus)\s+control\b/i, slugs: ['blog/what-is-ai-agent-observability-vs-control'] },
  { pattern: /\bruntime\s+trust\b/i, slugs: ['blog/runtime-trust-layer-for-ai-agents', 'product/overview'] },
  { pattern: /\blangchain\b/i, slugs: ['blog/langchain-agent-middleware-verification', 'blog/langchain-agent-security-setup-today', 'docs/index'] },
  { pattern: /\bprompt\s*injection\b/i, slugs: ['blog/indirect-prompt-injection-source-trust', 'blog/prompt-injection-in-shopping-agents'] },
  { pattern: /\bopenai\b.*\b(claude|gemini)\b|\bcontrol\s+plane\b/i, slugs: ['blog/can-openai-claude-gemini-share-one-agent-control-plane', 'blog/one-control-plane-openai-claude-gemini-agents'] },
  { pattern: /\bwhat\s+is\s+sanctum\b/i, slugs: ['product/overview', 'blog/introducing-sanctum-runtime', 'docs/index'] },
  { pattern: /\boffline\b|\blocal\s+model\b/i, slugs: ['blog/can-you-run-ai-agent-security-offline', 'blog/local-ollama-offline-runtime-trust'] },
  { pattern: /\bconfused\s+deputy\b/i, slugs: ['blog/what-is-confused-deputy-in-ai-agents'] },
  { pattern: /\bpolic(y|ies)\b.*\bscale\b|\bscale\b.*\bpolic/i, slugs: ['blog/how-to-design-ai-agent-policies-that-scale'] },
  { pattern: /\b(observer|operator|personal|team)\b.*\b(vs|versus|compare)\b|\bcompare\b.*\b(observer|operator|personal|team|plan|pricing)\b/i, slugs: ['page/pricing'] },
  { pattern: /\bteam\s+plan\b|\bhow\s+much\b.*\bteam\b/i, slugs: ['page/pricing'] },
  { pattern: /\bopen[\s-]*core\b/i, slugs: ['blog/open-core-ai-agent-security-vs-enterprise-suite', 'product/overview', 'docs/index'] },
  { pattern: /^(hi|hello|hey)\b|\bwhat can you (do|help)/i, slugs: ['product/overview', 'docs/index'] },
]

export function phraseSourceHints(phrases: string[], terms: string[]): string[] {
  const hints: string[] = []
  const blob = [...phrases, ...terms].join(' ').toLowerCase()

  for (const { pattern, slugs } of TOPIC_HINTS) {
    if (pattern.test(blob)) hints.push(...slugs)
  }
  return [...new Set(hints)]
}

export function topicHintsForMessage(message: string): string[] {
  const hints: string[] = []
  for (const { pattern, slugs } of TOPIC_HINTS) {
    if (pattern.test(message)) hints.push(...slugs)
  }
  return [...new Set(hints)]
}

export function enterprisePricingSummary(content: string): string | null {
  const match = content.match(/##\s*Enterprise[^#]*/i)
  if (!match) return null
  const lines = match[0]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join('\n')
  return `For **Enterprise** pricing:\n\n${lines}\n\nContact [sales](https://www.sanctumruntime.com/contact) for custom terms and pilots.`
}

/** Terms used in Supabase ilike filters — skip ultra-common words that match everything. */
export function termsForSourceQuery(terms: string[]): string[] {
  const phrases = terms.filter((t) => t.includes(' '))
  const words = terms.filter((t) => !t.includes(' '))
  const meaningful = words.filter((t) => t.length >= 4 || t === 'mcp' || t === 'sdk' || t === 'api')
  if (meaningful.length) return [...phrases, ...meaningful].slice(0, 8)
  return [...phrases, ...words].slice(0, 4)
}

export function scoreKbSource(
  source: {
    title: string
    summary?: string | null
    content_markdown: string
    source_type: string
    sales_weight?: number
  },
  terms: string[],
  salesIntent: boolean,
  phrases: string[] = [],
): number {
  const title = source.title.toLowerCase()
  const summary = (source.summary ?? '').toLowerCase()
  const content = source.content_markdown.slice(0, 5000).toLowerCase()

  let score = 0
  for (const phrase of phrases) {
    if (title.includes(phrase)) score += 24
    if (summary.includes(phrase)) score += 12
    if (content.includes(phrase)) score += 6
  }
  for (const term of terms) {
    if (phraseIncludesTerm(phrases, term)) continue
    if (title.includes(term)) score += 12
    if (summary.includes(term)) score += 6
    const contentHits = content.split(term).length - 1
    if (contentHits > 0) score += Math.min(contentHits, 4)
  }

  if (salesIntent && CONVERSION_TYPES.has(source.source_type)) score += 8
  if (!salesIntent && source.source_type === 'pricing' && score < 10) score -= 25
  if (!salesIntent && EDUCATIONAL_TYPES.has(source.source_type) && score > 0) score += 2

  score += (source.sales_weight ?? 0) * 0.15
  return score
}

function phraseIncludesTerm(phrases: string[], term: string): boolean {
  return phrases.some((p) => p.includes(term))
}

const TYPE_PRIORITY_SALES: Record<string, number> = {
  pricing: 100,
  product: 80,
  comparison: 70,
  sales_playbook: 60,
  blog: 20,
  docs: 30,
}

const TYPE_PRIORITY_EDU: Record<string, number> = {
  docs: 100,
  product: 90,
  blog: 80,
  faq: 70,
  glossary: 60,
  pricing: 10,
  comparison: 40,
}

export function rankChunksForQuery(message: string, chunks: SupportKbChunkMatch[]): SupportKbChunkMatch[] {
  const salesIntent = detectSalesIntent(message)
  const priorities = salesIntent ? TYPE_PRIORITY_SALES : TYPE_PRIORITY_EDU
  const terms = extractSearchTerms(message, salesIntent)
  const phrases = extractPhrases(message)
  const hintSlugs = new Set([
    ...phraseSourceHints(phrases, terms),
    ...topicHintsForMessage(message),
  ])

  return [...chunks].sort((a, b) => {
    const hintDelta = Number(hintSlugs.has(b.source_slug)) - Number(hintSlugs.has(a.source_slug))
    if (hintDelta !== 0) return hintDelta

    const simDelta = b.similarity - a.similarity
    if (Math.abs(simDelta) >= 0.06) return simDelta

    const typeDelta = (priorities[b.source_type] ?? 0) - (priorities[a.source_type] ?? 0)
    if (typeDelta !== 0) return typeDelta
    const weightDelta = (b.sales_weight ?? 0) - (a.sales_weight ?? 0)
    if (weightDelta !== 0) return weightDelta
    return b.similarity - a.similarity
  })
}

export function filterChunksForReply(message: string, chunks: SupportKbChunkMatch[]): SupportKbChunkMatch[] {
  const salesIntent = detectSalesIntent(message)
  const ranked = rankChunksForQuery(message, chunks)

  if (salesIntent) {
    const conversion = ranked.filter((c) => CONVERSION_TYPES.has(c.source_type))
    if (conversion.length) return conversion.slice(0, 4)
    return ranked.slice(0, 4)
  }

  const educational = ranked.filter((c) => !c.source_type || c.source_type !== 'pricing' || c.similarity >= 0.85)
  return (educational.length ? educational : ranked).slice(0, 4)
}

export function detectPlanTier(message: string): string | null {
  if (/\bcompare\b|\bvs\b|\bversus\b/i.test(message)) return null
  if (/\bteam\b/i.test(message)) return 'Team'
  if (/\boperator\b/i.test(message)) return 'Operator'
  if (/\bpersonal\b/i.test(message)) return 'Personal'
  if (/\bobserver\b/i.test(message)) return 'Observer'
  return null
}

export function planSectionFromChunk(content: string, planName: string): string | null {
  const match = content.match(new RegExp(`##\\s*${planName}[^#]*`, 'i'))
  if (!match) return null
  return match[0]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join('\n')
}

export function planComparisonSummary(content: string): string | null {
  const observer = planSectionFromChunk(content, 'Observer')
  const operator = planSectionFromChunk(content, 'Operator')
  if (!observer || !operator) return null
  return `Here is a comparison from our pricing page:\n\n${observer}\n\n${operator}`
}

export function pricingSummaryFromChunk(content: string): string | null {
  const observer = content.match(
    /##\s*Observer[^#]*?(?:Price:\s*\*\*\$0\*\*|free forever)[^#]*/i,
  )
  if (observer) {
    const line = observer[0]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join('\n')
    return `The cheapest plan is Observer — $0 / free forever. Observer is observe-only: unlimited observe events and no governed actions (no verify, approve, block, or gate). Upgrade to Personal for governed actions.\n\n${line.replace(/\*\*/g, '')}`
  }
  return null
}
