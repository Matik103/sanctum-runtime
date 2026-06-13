import { BLOG_ANSWER_POSTS } from './blog-answers'
import { getHubForSlug, type BlogHub } from './blog-hubs'
import { BLOG_POSTS, getBlogPost } from './blog-posts'

const DEFAULT_RELATED = [
  'runtime-trust-layer-for-ai-agents',
  'mcp-server-security-checklist-2026',
  'ai-agent-action-approval-before-execution',
  'what-is-agentic-ai-risk-management',
  'ai-agent-security-checklist-for-production',
]

/** Related slugs for internal linking — always up to 5, layered from explicit → hub → tags → defaults. */
export function getRelatedSlugs(slug: string): string[] {
  const seen = new Set<string>([slug])
  const result: string[] = []

  const add = (slugs: string[]) => {
    for (const s of slugs) {
      if (result.length >= 5) return
      if (seen.has(s) || !getBlogPost(s)) continue
      seen.add(s)
      result.push(s)
    }
  }

  const content = BLOG_ANSWER_POSTS[slug]
  if (content?.related.length) add(content.related)

  if (result.length < 5) {
    const hub: BlogHub = getHubForSlug(slug)
    add(hub.slugs)
  }

  if (result.length < 5) {
    const post = getBlogPost(slug)
    if (post) {
      const tagSet = new Set(post.tags)
      const scored = BLOG_POSTS.filter((p) => p.slug !== slug)
        .map((p) => ({
          slug: p.slug,
          score: p.tags.filter((t) => tagSet.has(t)).length,
        }))
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score)
      add(scored.map((p) => p.slug))
    }
  }

  if (result.length < 5) add(DEFAULT_RELATED)

  return result.slice(0, 5)
}
