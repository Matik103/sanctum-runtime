import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'

const slug = 'sanctum-vs-guardrails'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/sanctum-vs-guardrails')({
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
        Teams often ask: <em>we already have guardrails — why Sanctum?</em> Because guardrails protect{' '}
        <strong>conversation</strong>. Runtime trust protects <strong>execution</strong>.
      </p>
      <h2>Guardrails (input/output)</h2>
      <ul>
        <li>Jailbreak and toxicity filters on prompts and replies</li>
        <li>PII redaction in chat</li>
        <li>Structured output validation</li>
      </ul>
      <h2>Sanctum Runtime (action layer)</h2>
      <ul>
        <li>Intercepts tool calls, API writes, robot commands</li>
        <li>Policy: approve · verify · block per action type</li>
        <li>Signed action tokens, blast-radius scoring, audit for SOC2 / NIST AI RMF</li>
      </ul>
      <h2>Use both</h2>
      <p>
        Moderation on chat; Sanctum on anything that changes the world. That stack is the production pattern for
        agentic SaaS, robotics integrators, and enterprise automation.
      </p>
      <p>
        <Link to="/security" className="text-primary hover:underline">Security overview</Link>
        {' · '}
        <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
          Runtime trust layer
        </Link>
      </p>
    </BlogLayout>
  )
}
