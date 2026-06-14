import { describe, expect, it } from 'vitest'
import {
  detectPlanTier,
  detectSalesIntent,
  extractSearchTerms,
  filterChunksForReply,
  planComparisonSummary,
  planSectionFromChunk,
  rankChunksForQuery,
  scoreKbSource,
  termsForSourceQuery,
  topicHintsForMessage,
} from './support-agent-retrieval.js'
import type { SupportKbChunkMatch } from './support-agent-store.js'

const PRICING = `# Sanctum Runtime Pricing

## Observer (cheapest plan — free forever)
- Price: **$0** / free forever

## Personal
- Price: **$12/month**

## Operator (recommended for production)
- Price: **$59/month**

## Team
- Price: **$299/month** | Unlimited operators
`

function chunk(partial: Partial<SupportKbChunkMatch> & Pick<SupportKbChunkMatch, 'source_type' | 'source_slug'>): SupportKbChunkMatch {
  return {
    chunk_id: 'c1',
    source_id: 's1',
    source_title: partial.source_title ?? partial.source_slug,
    canonical_url: null,
    chunk_kind: 'paragraph',
    heading: null,
    content: partial.content ?? '',
    similarity: partial.similarity ?? 0.5,
    intent_tags: [],
    sales_weight: partial.sales_weight ?? 0,
    sales_signals: {},
    ...partial,
  }
}

describe('support-agent-retrieval', () => {
  it('does not treat agent buy-safety questions as sales', () => {
    expect(detectSalesIntent('can AI agents buy things online safely?')).toBe(false)
    expect(detectSalesIntent('what is the cheapest plan?')).toBe(true)
    expect(detectSalesIntent('compare Observer vs Operator')).toBe(true)
  })

  it('drops stop words from search terms', () => {
    const terms = extractSearchTerms('how do action tokens work?', false)
    expect(terms).toContain('action')
    expect(terms).toContain('tokens')
    expect(terms).not.toContain('how')
  })

  it('prefers meaningful terms for ilike', () => {
    expect(termsForSourceQuery(['mcp', 'sanctum', 'how', 'action tokens'])).toEqual([
      'action tokens',
      'mcp',
      'sanctum',
    ])
  })

  it('scores pricing higher for sales queries', () => {
    const pricing = scoreKbSource(
      {
        title: 'Sanctum Runtime Pricing Plans',
        content_markdown: 'Observer free forever $0',
        source_type: 'pricing',
        sales_weight: 10,
      },
      extractSearchTerms('cheapest plan', true),
      true,
    )
    const blog = scoreKbSource(
      {
        title: 'Can OpenAI share one control plane?',
        content_markdown: 'plan for multi-provider agents',
        source_type: 'blog',
        sales_weight: 2,
      },
      extractSearchTerms('cheapest plan', true),
      true,
    )
    expect(pricing).toBeGreaterThan(blog)
  })

  it('ranks MCP blog above pricing for MCP questions', () => {
    const chunks = [
      chunk({ source_type: 'pricing', source_slug: 'page/pricing', sales_weight: 10, similarity: 0.5 }),
      chunk({
        source_type: 'blog',
        source_slug: 'blog/mcp-server-action-gate',
        source_title: 'MCP server action gate',
        sales_weight: 2,
        similarity: 0.7,
      }),
      chunk({ source_type: 'docs', source_slug: 'docs/index', sales_weight: 5, similarity: 0.65 }),
    ]
    const ranked = rankChunksForQuery('what is MCP and how does Sanctum use it?', chunks)
    expect(ranked[0].source_slug).not.toBe('page/pricing')
    expect(['blog/mcp-server-action-gate', 'docs/index']).toContain(ranked[0].source_slug)
  })

  it('filters pricing out of non-sales replies when other chunks exist', () => {
    const chunks = [
      chunk({ source_type: 'pricing', source_slug: 'page/pricing', similarity: 0.5 }),
      chunk({
        source_type: 'blog',
        source_slug: 'blog/signed-action-tokens-executor-verification',
        similarity: 0.72,
      }),
    ]
    const filtered = filterChunksForReply('how do action tokens work?', chunks)
    expect(filtered.every((c) => c.source_type !== 'pricing')).toBe(true)
  })

  it('maps topic hints for common visitor questions', () => {
    expect(topicHintsForMessage('how do I install the SDK?')).toContain('docs/index')
    expect(topicHintsForMessage('can AI agents buy things online safely?')).toContain(
      'blog/can-ai-agents-buy-online-safely',
    )
    expect(topicHintsForMessage('what is SOC2 compliance for AI agents?')).toContain(
      'blog/can-ai-agents-be-soc2-compliant',
    )
    expect(topicHintsForMessage('where is the console?')).toContain('product/overview')
    expect(topicHintsForMessage('what is confused deputy in AI agents?')).toContain(
      'blog/what-is-confused-deputy-in-ai-agents',
    )
  })
})

describe('plan-aware replies', () => {
  it('detects plan tier from message', () => {
    expect(detectPlanTier('how much is the Team plan?')).toBe('Team')
    expect(detectPlanTier('compare Observer vs Operator')).toBeNull()
  })

  it('extracts Team section', () => {
    const section = planSectionFromChunk(PRICING, 'Team')
    expect(section).toMatch(/\$299/)
    expect(section).toMatch(/Team/)
  })

  it('builds Observer vs Operator comparison', () => {
    const summary = planComparisonSummary(PRICING)
    expect(summary).toMatch(/Observer/)
    expect(summary).toMatch(/Operator/)
    expect(summary).toMatch(/\$59/)
  })

  it('hints plan comparison to pricing page', () => {
    expect(topicHintsForMessage('compare Observer vs Operator')).toContain('page/pricing')
    expect(topicHintsForMessage('how much is the Team plan?')).toContain('page/pricing')
  })
})
