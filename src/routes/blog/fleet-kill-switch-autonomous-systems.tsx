import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { consoleUrl } from '@/lib/site-links'

const slug = 'fleet-kill-switch-autonomous-systems'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/fleet-kill-switch-autonomous-systems')({
  component: PostPage,
  head: () => ({
    ...pageSeo({ title: `${post.title} — Sanctum`, description: post.description, path: blogPostPath(slug), ogType: 'article' }),
    scripts: [{ type: 'application/ld+json', children: JSON.stringify(articleJsonLd(post)) }],
  }),
})

function PostPage() {
  return (
    <BlogLayout post={post}>
      <p>
        Incident response for autonomous fleets needs a <strong>big red button</strong> that works in seconds — not
        a ticket to disable API keys one service at a time. Sanctum’s org-wide <strong>kill switch</strong> returns
        BLOCKED on every <code>verifyAction</code> until an operator resumes.
      </p>
      <h2>When to use it</h2>
      <ul>
        <li>Suspected prompt injection across multiple agents</li>
        <li>Bad model deploy or policy misconfiguration</li>
        <li>Security exercise or regulated maintenance window</li>
      </ul>
      <h2>What still works</h2>
      <p>
        Audit logging continues. Operators review the queue in the{' '}
        <a href={consoleUrl} className="text-primary hover:underline">console</a> or{' '}
        <Link to={blogPostPath('mobile-pwa-runtime-verification')} className="text-primary hover:underline">
          mobile PWA
        </Link>
        . Resume restores normal policy evaluation — no redeploy required.
      </p>
      <p>
        <Link to={blogPostPath('soc2-nist-ai-rmf-runtime-evidence')} className="text-primary hover:underline">
          Compliance evidence
        </Link>
        {' · '}
        <Link to="/enterprise/" className="text-primary hover:underline">Enterprise</Link>
      </p>
    </BlogLayout>
  )
}
