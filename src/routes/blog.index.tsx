import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Calendar } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CtaFooter } from '@/components/CtaFooter'
import { BLOG_POSTS, blogPostPath } from '@/lib/blog-posts'
import { pageSeo } from '@/lib/seo'

const path = '/blog'
const title = 'Blog — Sanctum Runtime'
const description =
  'Articles on runtime trust, AI agent action approval, embodied AI, robotics policy gates, guardrails vs execution control, and mobile verification for autonomous systems.'

export const Route = createFileRoute('/blog/')({
  component: BlogIndexPage,
  head: () => pageSeo({ title, description, path }),
})

function BlogIndexPage() {
  const featured = BLOG_POSTS.filter((p) => p.featured)
  const rest = BLOG_POSTS.filter((p) => !p.featured)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-24">
        <div className="container mx-auto px-6 max-w-4xl">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Blog</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight">
            Runtime trust for autonomous systems
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Deep dives on AI agents, embodied AI, robotics, policy engines, human-in-the-loop verification,
            and building production-grade trust infrastructure — written for engineers and operators.
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
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-6">
              All posts
            </h2>
            <ul className="space-y-4">
              {[...featured, ...rest].map((post) => (
                <li key={post.slug}>
                  <BlogCard post={post} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
      <CtaFooter />
    </div>
  )
}

function BlogCard({
  post,
  large,
}: {
  post: (typeof BLOG_POSTS)[number]
  large?: boolean
}) {
  const date = new Date(post.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

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
