import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'

const slug = 'signed-action-tokens-executor-verification'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/signed-action-tokens-executor-verification')({
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
        Approval in a dashboard is not proof an executor saw it. <strong>Signed action tokens</strong> are
        short-lived HMAC-SHA256 credentials binding actor, action, org, and audit ID — executors must verify before
        running side effects.
      </p>
      <h2>Why tokens matter</h2>
      <ul>
        <li>Prevents “replay” of stale approvals</li>
        <li>Stops bypass paths that skip the runtime</li>
        <li>Gives microservices a cryptographic check, not honor system</li>
      </ul>
      <h2>Flow</h2>
      <ol>
        <li>Agent calls verifyAction → APPROVED</li>
        <li>Runtime returns action_token (5 min TTL)</li>
        <li>Executor verifies token → executes → reports result</li>
      </ol>
      <p>
        <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
          Runtime trust layer
        </Link>
        {' · '}
        <Link to="/sdk" className="text-primary hover:underline">SDK</Link>
      </p>
    </BlogLayout>
  )
}
