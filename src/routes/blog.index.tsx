import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Calendar } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CtaFooter } from '@/components/CtaFooter'
import { getHubForSlug, getPostsForHub, BLOG_HUBS } from '@/lib/blog-hubs'
import { BLOG_POSTS, blogPostPath, getBlogPost } from '@/lib/blog-posts'
import { blogIndexJsonLd, pageSeo } from '@/lib/seo'
import { formatPublishedDate } from '@/lib/format-date'
import { llmsTxtUrl } from '@/lib/site-links'

const path = '/blog'
const title = 'AI Agent Security & Runtime Trust Blog — Sanctum'
const description =
  'Guides on agentic AI risk management, MCP security, runtime authorization, human-in-the-loop approvals, agentic commerce fraud, and SOC 2 evidence for autonomous systems.'

function hubFaqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: BLOG_HUBS.map((hub) => ({
      '@type': 'Question',
      name: `What is ${hub.title}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: hub.description,
      },
    })),
  }
}

export const Route = createFileRoute('/blog/')({
  component: BlogIndexPage,
  head: () => ({
    ...pageSeo({ title, description, path }),
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(blogIndexJsonLd(BLOG_POSTS)),
      },
      {
        type: 'application/ld+json',
        children: JSON.stringify(hubFaqJsonLd()),
      },
    ],
  }),
})

function BlogIndexPage() {
  const featured = BLOG_POSTS.filter((p) => p.featured)
  const assignedSlugs = new Set<string>()
  for (const hub of BLOG_HUBS) {
    for (const p of getPostsForHub(hub)) assignedSlugs.add(p.slug)
  }
  const rest = BLOG_POSTS.filter((p) => !p.featured && !assignedSlugs.has(p.slug))

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-[calc(7rem+env(safe-area-inset-top,0px))] pb-24">
        <div className="container mx-auto px-6 max-w-4xl">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Blog</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">
            AI agent security, runtime authorization & compliance guides
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Practical guides for engineers and operators: MCP hardening, agentic AI risk management,
            human-in-the-loop approvals, agentic commerce fraud prevention, and SOC 2-ready audit trails.
          </p>
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl">
            For AI assistants and crawlers:{' '}
            <a href={llmsTxtUrl} className="text-primary hover:underline">
              llms.txt
            </a>
            {' · '}
            <a href="/ai/blog-index.md" className="text-primary hover:underline">
              blog index (markdown)
            </a>
          </p>

          {featured.length > 0 && (
            <section className="mt-14">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
                Featured
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {featured.map((post) => (
                  <BlogCard key={post.slug} post={post} large />
                ))}
              </div>
            </section>
          )}

          <section className="mt-14">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Guides by topic
            </h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
              Start with a pillar guide, then drill into checklists, comparisons, and implementation patterns.
            </p>
            <div className="space-y-10">
              {BLOG_HUBS.map((hub) => (
                <HubSection key={hub.id} hub={hub} />
              ))}
            </div>
          </section>

          {rest.length > 0 && (
            <section className="mt-14">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
                More articles
              </h2>
              <ul className="space-y-4">
                {rest.map((post) => (
                  <li key={post.slug}>
                    <BlogCard post={post} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <CtaFooter />
    </div>
  )
}

function HubSection({ hub }: { hub: (typeof BLOG_HUBS)[number] }) {
  const anchor = getBlogPost(hub.anchorSlug)
  const posts = getPostsForHub(hub)

  return (
    <section id={hub.id} className="scroll-mt-28 glass rounded-xl p-6 md:p-8">
      <h3 className="text-xl font-semibold text-foreground">{hub.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">{hub.description}</p>
      {anchor && (
        <Link
          to={blogPostPath(anchor.slug)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Start with: {anchor.title}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              to={blogPostPath(post.slug)}
              className="text-sm text-foreground hover:text-primary transition-colors leading-snug"
            >
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BlogCard({
  post,
  large,
}: {
  post: (typeof BLOG_POSTS)[number]
  large?: boolean
}) {
  const date = formatPublishedDate(post.publishedAt)

  return (
    <Link
      to={blogPostPath(post.slug)}
      className={`group block glass rounded-xl p-6 hover:border-primary/40 transition-all ${large ? 'md:p-8' : ''}`}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {post.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-xs text-muted-foreground">
            #{tag}
          </span>
        ))}
      </div>
      <h3 className={`font-semibold text-foreground group-hover:text-primary transition-colors ${large ? 'text-xl' : 'text-lg'}`}>
        {post.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-2">{post.description}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          {date} · {post.readTime} min
        </span>
        <span className="inline-flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Read <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  )
}
