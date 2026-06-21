import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { BlogConsoleCta } from '@/components/BlogConsoleCta'
import { CtaFooter } from '@/components/CtaFooter'
import type { BlogPostMeta } from '@/lib/blog-posts'
import { blogIndexPath, blogPostPath } from '@/lib/blog-posts'
import { BlogRelatedGuides } from '@/components/BlogRelatedGuides'
import { getHubForSlug } from '@/lib/blog-hubs'
import { getRelatedSlugs } from '@/lib/blog-related'
import { consoleUrl } from '@/lib/site-links'

type Props = {
  post: BlogPostMeta
  children: ReactNode
  slug?: string
  /** Set false when the article body renders its own console CTA (e.g. before related links). */
  showConsoleCta?: boolean
  /** Set false when the article body renders its own related-guides block. */
  showRelatedGuides?: boolean
}

export function BlogLayout({
  post,
  children,
  slug,
  showConsoleCta = true,
  showRelatedGuides = true,
}: Props) {
  const hub = slug ? getHubForSlug(slug) : undefined
  const date = new Date(post.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-[calc(7rem+env(safe-area-inset-top,0px))] pb-24">
        <article className="container mx-auto px-6 max-w-3xl">
          <Link
            to={blogIndexPath}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
          {hub && (
            <p className="text-xs font-medium text-primary uppercase tracking-wider mb-3">
              <Link to={blogIndexPath} hash={hub.id} className="hover:underline">
                {hub.title}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-0.5 rounded-full border border-border bg-surface/60 text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">{post.title}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{post.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden />
              {date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden />
              {post.readTime} min read
            </span>
          </div>
          <div className="mt-10 space-y-6 text-muted-foreground leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-foreground [&_h3]:font-medium [&_h3]:mt-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_a]:text-primary [&_a]:hover:underline [&_pre]:bg-surface [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-sm [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-sm">
            {children}
          </div>
          {showConsoleCta ? <BlogConsoleCta slug={post.slug} /> : null}
          {slug && showRelatedGuides ? (
            <BlogRelatedGuides slug={slug} relatedSlugs={getRelatedSlugs(slug)} />
          ) : null}
          <p className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
            Guides:{' '}
            <Link to={blogIndexPath} hash="agentic-risk" className="text-primary hover:underline">
              agentic AI risk
            </Link>
            {' · '}
            <Link to={blogIndexPath} hash="mcp-security" className="text-primary hover:underline">
              MCP security
            </Link>
            {' · '}
            <Link to={blogIndexPath} hash="runtime-authorization" className="text-primary hover:underline">
              runtime authorization
            </Link>
            {' · '}
            <Link to={blogIndexPath} hash="hitl-approvals" className="text-primary hover:underline">
              HITL approvals
            </Link>
            {' · '}
            <Link to={blogIndexPath} hash="developer-agents" className="text-primary hover:underline">
              coding agents
            </Link>
            {' · '}
            <Link to={blogIndexPath} hash="get-started" className="text-primary hover:underline">
              get started
            </Link>
            <br className="hidden sm:block" />
            <span className="sm:ml-0">
              More:{' '}
              <Link to={blogIndexPath} className="text-primary hover:underline">
                all posts
              </Link>
              {' · '}
              <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
                AI trust layer
              </Link>
              {' · '}
              <a href={consoleUrl} className="text-primary hover:underline">
                open Sanctum Console
              </a>
            </span>
          </p>
        </article>
      </main>
      <CtaFooter />
    </div>
  )
}
