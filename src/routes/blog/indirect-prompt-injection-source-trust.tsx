import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'

const slug = 'indirect-prompt-injection-source-trust'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/indirect-prompt-injection-source-trust')({
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
        <strong>Indirect prompt injection</strong> hides instructions in web pages, emails, or tool output. The model
        obeys attacker text and calls dangerous tools. Sanctum uses <strong>source-trust classification</strong> so
        policies treat untrusted content differently from the human operator.
      </p>
      <h2>Source-trust levels</h2>
      <p>
        Seven levels including <code>untrusted_content</code> and <code>tool_output</code>. Policies can require
        verify for any action proposed when source trust is low — regardless of what the model “wants.”
      </p>
      <h2>Deterministic defense</h2>
      <p>
        Combine source trust with blast-radius scoring: external destinations, physical world flags, and estimated
        value drive REQUIRE_VERIFICATION before execution.
      </p>
      <p>
        <Link to={blogPostPath('mcp-server-action-gate')} className="text-primary hover:underline">MCP action gate</Link>
        {' · '}
        <Link to={blogPostPath('sanctum-vs-guardrails')} className="text-primary hover:underline">vs guardrails</Link>
      </p>
    </BlogLayout>
  )
}
