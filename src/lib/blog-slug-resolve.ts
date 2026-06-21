import { BLOG_POSTS, getBlogPost } from './blog-posts'

/** Map hyphen-stripped slug → canonical slug (e.g. mcpsecurityplatform… → mcp-security-platform…). */
const SLUG_BY_COMPACT = new Map<string, string>()

for (const post of BLOG_POSTS) {
  const compact = post.slug.replace(/-/g, '')
  if (!SLUG_BY_COMPACT.has(compact)) {
    SLUG_BY_COMPACT.set(compact, post.slug)
  }
}

/** Resolve blog slug — exact match first, then hyphen-stripped alias. */
export function resolveBlogSlug(raw: string): string | undefined {
  if (getBlogPost(raw)) return raw
  const compact = raw.toLowerCase().replace(/-/g, '')
  return SLUG_BY_COMPACT.get(compact)
}
