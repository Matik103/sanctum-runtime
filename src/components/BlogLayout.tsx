import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CtaFooter } from '@/components/CtaFooter'
import type { BlogPostMeta } from '@/lib/blog-posts'
import { blogPostPath } from '@/lib/blog-posts'

type Props = {
  post: BlogPostMeta
  children: ReactNode
}

export function BlogLayout({ post, children }: Props) {
  const date = new Date(post.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-24">
        <article className="container mx-auto px-6 max-w-3xl">
          <Link
            to="/blog/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
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
          <p className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
            More:{' '}
            <Link to="/blog/" className="text-primary hover:underline">
              all posts
            </Link>
            {' · '}
            <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
              runtime trust layer
            </Link>
          </p>
        </article>
      </main>
      <CtaFooter />
    </div>
  )
}
