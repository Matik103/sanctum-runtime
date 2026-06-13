import type { BlogPostMeta } from './blog-posts'

const YEAR = '2026'

/** Auto-optimize SERP title when no manual override exists. */
export function autoOptimizeTitle(title: string, tags: string[]): string {
  let t = title.trim().replace(/\s+/g, ' ')

  t = t.replace(/\bai agents?\b/gi, 'AI Agents')
  t = t.replace(/\bai agent\b/gi, 'AI Agent')
  t = t.replace(/\bmcp\b/g, 'MCP')
  t = t.replace(/\bsoc\s*2\b/gi, 'SOC 2')
  t = t.replace(/\bhitl\b/gi, 'Human-in-the-Loop')
  t = t.replace(/\brbac\b/gi, 'RBAC')

  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1)
  }

  const wantsYear =
    tags.some((tag) =>
      ['transactional', 'comparison', 'checklist', 'buyers-guide', 'security', 'acquisition'].includes(tag),
    ) ||
    /\b(checklist|comparison|best|buyer|guide|software|platform|requirements)\b/i.test(t)

  if (wantsYear && !/\b20\d{2}\b/.test(t)) {
    if (t.endsWith('?')) {
      t = t.slice(0, -1).trim()
    }
    if (!/\(\d{4}\)/.test(t)) {
      t = `${t} (${YEAR})`
    }
  }

  if (t.length > 58 && !t.includes(':')) {
    const colonIdx = t.indexOf(' — ')
    if (colonIdx > 20 && colonIdx < 55) {
      t = t.slice(0, colonIdx)
    }
  }

  return t
}

/** Auto-optimize meta description for CTR when no manual override exists. */
export function autoOptimizeDescription(
  description: string,
  readTime: number,
  tags: string[],
): string {
  let d = description.trim().replace(/\s+/g, ' ')

  if (!d.endsWith('.')) d += '.'

  const hasCta =
    /\b(checklist|compare|deploy|guide|patterns|step|free|start)\b/i.test(d) || d.length >= 130

  if (!hasCta) {
    if (tags.includes('transactional') || tags.includes('comparison')) {
      d += ' Compare options and deploy runtime controls this quarter.'
    } else if (tags.includes('get-started') || tags.includes('founder')) {
      d += ' Quick start with Sanctum Console and SDK — gate your first action today.'
    } else {
      d += ` ${readTime}-min guide with checklist, FAQ answers, and SDK integration patterns.`
    }
  }

  if (d.length > 158) {
    const cut = d.lastIndexOf(' ', 155)
    d = (cut > 100 ? d.slice(0, cut) : d.slice(0, 155)).trimEnd() + '…'
  }

  return d
}

export function autoSeoFromPost(post: BlogPostMeta): { title: string; description: string } {
  return {
    title: autoOptimizeTitle(post.title, post.tags),
    description: autoOptimizeDescription(post.description, post.readTime, post.tags),
  }
}
