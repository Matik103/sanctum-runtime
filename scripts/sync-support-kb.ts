import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BLOG_ANSWER_POSTS } from '../src/lib/blog-answers.ts'
import { getExpandedSections } from '../src/lib/blog-expanded-sections.ts'
import { BLOG_POSTS } from '../src/lib/blog-posts.ts'
import { embedTexts } from '../apps/api/src/support-embeddings.ts'
import { loadRepoEnv } from './env.ts'

loadRepoEnv()

const MARKETING_URL = (process.env.VITE_MARKETING_URL ?? 'https://www.sanctumruntime.com').replace(
  /\/$/,
  '',
)

type KbSourceInput = {
  slug: string
  source_type: string
  title: string
  summary: string
  content_markdown: string
  canonical_url: string
  external_key: string
  tags: string[]
  intent_tags: string[]
  sales_weight: number
}

const PRICING_MARKDOWN = `# Sanctum Runtime Pricing

## Observer (cheapest plan — free forever, observe only)
- Price: **$0** / free forever
- Best for: watching agent side effects before paying for production control
- Agents: 2
- Runtimes: 3
- Governed actions: none (observe only — no verify, approve, block, or gate)
- Observe events: unlimited
- Retention: 7 days
- Features: Connect proxy observe mode, Live Feed, audit read

## Personal
- Price: **$12/month** or **$99/year** (indie builders)
- Agents: 5 | Governed actions: 500/mo | Retention: 30 days
- Connect observe to gate, basic policies, alerts, Balanced and Observe presets

## Operator (recommended for production)
- Price: **$59/month**
- Agents: 10 | Runtimes: 25 | Governed actions: 500k/mo
- Full Shield, holds, mobile approve, webhooks, hosted Connect proxy

## Team
- Price: **$299/month** | Unlimited operators
- Governed actions: 10M/mo | SSO/RBAC | Compliance exports | Priority support

## Enterprise
- Custom pricing for fleet, SSO, compliance, and dedicated support — contact sales.

Start free on Observer ($0), then upgrade when you need production gates.
`

const PRODUCT_MARKDOWN = `# What is Sanctum Runtime?

Sanctum is the **runtime trust boundary** for autonomous AI: verify tool calls before execution, pause for human approval, issue signed action tokens, and keep audit evidence.

- Works with OpenAI, Claude, Gemini, MCP, LangChain, robots, and workflow agents
- Decisions: APPROVED, REQUIRE_VERIFICATION, or BLOCKED before side effects run
- Open-core SDK + hosted console for operators
- Console: https://console.sanctumruntime.com
- Docs: ${MARKETING_URL}/docs
- Pricing: ${MARKETING_URL}/pricing
`

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function blogToMarkdown(slug: string): string | null {
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) return null
  const content = BLOG_ANSWER_POSTS[slug]
  const expanded = getExpandedSections(slug)

  const intro = content?.intro ?? post.description
  const parts = [
    `# ${post.title}`,
    '',
    post.description,
    '',
    intro,
    '',
    ...expanded.flatMap((s) => [
      `## ${s.heading}`,
      '',
      ...s.paragraphs,
      '',
      ...(s.bullets?.map((b) => `- ${b}`) ?? []),
      '',
    ]),
  ]

  if (content) {
    parts.push(
      '## Key takeaways',
      '',
      ...content.keyPoints.map((p) => `- ${p}`),
      '',
      '## FAQ',
      '',
      ...content.answers.flatMap((a) => [`### ${a.question}`, '', a.answer, '']),
    )
  }

  parts.push('', `Tags: ${post.tags.join(', ')}`)
  return parts.join('\n').trim()
}

function extractDocsMarkdown(): string {
  const docsPath = resolve(process.cwd(), 'src/routes/docs.tsx')
  const raw = readFileSync(docsPath, 'utf8')
  const strings = new Set<string>()

  for (const m of raw.matchAll(/>([^<>{}\n]{24,})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim()
    if (!/^[\w\s.,;:'"()\-–—/]+$/.test(t)) continue
    strings.add(t)
  }

  for (const m of raw.matchAll(/items:\s*\[([\s\S]*?)\]/g)) {
    for (const s of m[1].matchAll(/'([^']{8,})'/g)) strings.add(s[1])
  }

  const body = [...strings].join('\n\n')
  return `# Sanctum Runtime Documentation\n\n${body}`.slice(0, 120_000)
}

function buildSources(): KbSourceInput[] {
  const sources: KbSourceInput[] = [
    {
      slug: 'page/pricing',
      source_type: 'pricing',
      title: 'Sanctum Runtime Pricing Plans',
      summary: 'Observer free observe-only plan, Personal $12, Operator $59, Team $299, Enterprise custom.',
      content_markdown: PRICING_MARKDOWN,
      canonical_url: `${MARKETING_URL}/pricing`,
      external_key: 'page/pricing',
      tags: ['pricing', 'plans', 'observer', 'personal', 'operator', 'team', 'enterprise'],
      intent_tags: ['buy', 'pricing', 'compare', 'onboard'],
      sales_weight: 10,
    },
    {
      slug: 'product/overview',
      source_type: 'product',
      title: 'Sanctum Runtime Overview',
      summary: 'Runtime trust boundary for AI agents — verify, approve, and audit before execution.',
      content_markdown: PRODUCT_MARKDOWN,
      canonical_url: `${MARKETING_URL}/`,
      external_key: 'product/overview',
      tags: ['product', 'runtime-trust', 'mcp', 'agents'],
      intent_tags: ['learn', 'onboard'],
      sales_weight: 7,
    },
    {
      slug: 'docs/index',
      source_type: 'docs',
      title: 'Sanctum Runtime Developer Docs',
      summary: 'SDK, verifyAction(), policy engine, MCP integration, and quick start.',
      content_markdown: extractDocsMarkdown(),
      canonical_url: `${MARKETING_URL}/docs`,
      external_key: 'docs/index',
      tags: ['docs', 'sdk', 'api', 'quickstart', 'mcp'],
      intent_tags: ['learn', 'troubleshoot', 'onboard'],
      sales_weight: 5,
    },
  ]

  for (const post of BLOG_POSTS) {
    const md = blogToMarkdown(post.slug)
    if (!md) continue
    const isPricing = /pricing|plan|cost|buy|enterprise/i.test(
      `${post.title} ${post.tags.join(' ')}`,
    )
    sources.push({
      slug: `blog/${post.slug}`,
      source_type: 'blog',
      title: post.title,
      summary: post.description,
      content_markdown: md,
      canonical_url: `${MARKETING_URL}/blog/${post.slug}/`,
      external_key: post.slug,
      tags: post.tags,
      intent_tags: isPricing ? ['learn', 'buy', 'pricing'] : ['learn', 'troubleshoot'],
      sales_weight: isPricing ? 8 : 3,
    })
  }

  return sources
}

type ChunkDraft = { heading: string | null; content: string; kind: string }

function chunkMarkdown(markdown: string, maxLen = 900): ChunkDraft[] {
  const sections = markdown.split(/\n(?=## )/)
  const chunks: ChunkDraft[] = []

  for (const section of sections) {
    const lines = section.trim().split('\n')
    const heading = lines[0]?.startsWith('#') ? lines[0].replace(/^#+\s*/, '') : null
    const body = (heading ? lines.slice(1) : lines).join('\n').trim()
    if (!body) continue

    let start = 0
    while (start < body.length) {
      const slice = body.slice(start, start + maxLen).trim()
      if (slice.length < 80 && chunks.length) break
      if (slice.length >= 40) {
        chunks.push({
          heading,
          content: heading ? `${heading}\n\n${slice}` : slice,
          kind: heading?.toLowerCase().includes('pricing') ? 'pricing' : 'paragraph',
        })
      }
      if (start + maxLen >= body.length) break
      start += maxLen - 120
    }
  }

  return chunks.length ? chunks : [{ heading: null, content: markdown.slice(0, maxLen), kind: 'paragraph' }]
}

async function resolveOpenRouterKey(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const env = process.env.OPENROUTER_API_KEY?.trim()
  if (env) return env
  const { data } = await sb.from('support_agent_config').select('value').eq('key', 'openrouter').maybeSingle()
  const fromDb = (data?.value as { api_key?: string } | undefined)?.api_key?.trim()
  return fromDb || null
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()

  if (!url || !serviceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const apiKey = await resolveOpenRouterKey(sb)
  if (!apiKey) {
    console.warn('No OPENROUTER_API_KEY — syncing sources/chunks only (text search). Add key and re-run for embeddings.')
  }

  const { data: cfgRow } = await sb.from('support_agent_config').select('value').eq('key', 'openrouter').maybeSingle()
  const cfg = (cfgRow?.value ?? {}) as {
    embedding_model?: string
    embedding_dimensions?: number
  }
  const embeddingModel = cfg.embedding_model ?? 'nvidia/llama-nemotron-embed-vl-1b-v2:free'
  const embeddingDims = cfg.embedding_dimensions ?? 1536

  const { data: run, error: runErr } = await sb
    .from('support_kb_sync_runs')
    .insert({ trigger: 'full_reindex', status: 'running' })
    .select('id')
    .single()
  if (runErr) throw runErr

  const sources = buildSources()
  let sourcesUpserted = 0
  let chunksCreated = 0
  let embeddingsWritten = 0

  console.log(`Syncing ${sources.length} KB sources…`)

  for (const src of sources) {
    const contentHash = sha256(src.content_markdown)
    const { data: existing } = await sb
      .from('support_kb_sources')
      .select('id, content_hash')
      .eq('slug', src.slug)
      .maybeSingle()

    const { data: upserted, error: upErr } = await sb
      .from('support_kb_sources')
      .upsert(
        {
          slug: src.slug,
          source_type: src.source_type,
          title: src.title,
          summary: src.summary,
          content_markdown: src.content_markdown,
          canonical_url: src.canonical_url,
          external_key: src.external_key,
          tags: src.tags,
          intent_tags: src.intent_tags,
          sales_weight: src.sales_weight,
          is_published: true,
          content_hash: contentHash,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()
    if (upErr) throw upErr
    sourcesUpserted++

    const sourceId = upserted.id as string
    const unchanged = existing?.content_hash === contentHash
    if (unchanged) continue

    await sb.from('support_kb_chunks').delete().eq('source_id', sourceId)
    const drafts = chunkMarkdown(src.content_markdown)

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i]
      const chunkHash = sha256(d.content)
      const { data: chunk, error: chErr } = await sb
        .from('support_kb_chunks')
        .insert({
          source_id: sourceId,
          chunk_index: i,
          chunk_kind: d.kind,
          heading: d.heading,
          content: d.content,
          content_hash: chunkHash,
        })
        .select('id, content')
        .single()
      if (chErr) throw chErr
      chunksCreated++

      if (apiKey) {
        const [embedding] = await embedTexts(apiKey, embeddingModel, [chunk.content as string], embeddingDims)
        if (embedding) {
          await sb
            .from('support_kb_chunks')
            .update({
              embedding,
              embedding_model: embeddingModel,
              embedded_at: new Date().toISOString(),
            })
            .eq('id', chunk.id)
          embeddingsWritten++
        }
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 400))
      }
    }
  }

  await sb
    .from('support_kb_sync_runs')
    .update({
      status: 'completed',
      sources_upserted: sourcesUpserted,
      chunks_created: chunksCreated,
      embeddings_written: embeddingsWritten,
      finished_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  console.log(
    `✓ KB sync done — ${sourcesUpserted} sources, ${chunksCreated} chunks, ${embeddingsWritten} embeddings`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
