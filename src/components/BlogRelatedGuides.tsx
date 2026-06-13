import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { getHubForSlug } from '@/lib/blog-hubs'
import { blogPostPath, getBlogPost } from '@/lib/blog-posts'

type Props = {
  slug: string
  relatedSlugs: string[]
}

export function BlogRelatedGuides({ slug, relatedSlugs }: Props) {
  const hub = getHubForSlug(slug)
  const related = relatedSlugs
    .filter((s) => s !== slug)
    .map((s) => getBlogPost(s))
    .filter(Boolean)

  if (!hub && related.length === 0) return null

  return (
    <aside className="!mt-12 !mb-4 rounded-xl border border-border bg-surface/40 p-6 md:p-8">
      {hub && (
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-primary mb-2">
            Part of guide
          </p>
          <h2 className="text-lg font-semibold text-foreground">{hub.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{hub.description}</p>
          <Link
            to="/blog/"
            hash={hub.id}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Browse full guide <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {related.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Related guides
          </h3>
          <ul className="space-y-3">
            {related.slice(0, 5).map((post) => (
              <li key={post!.slug}>
                <Link
                  to={blogPostPath(post!.slug)}
                  className="group block text-sm leading-relaxed"
                >
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {post!.title}
                  </span>
                  <span className="block mt-0.5 text-muted-foreground line-clamp-2">
                    {post!.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
