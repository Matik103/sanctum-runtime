import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { consoleUrl, docsPath } from '@/lib/site-links'

const slug = 'runtime-trust-layer-for-ai-agents'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/runtime-trust-layer-for-ai-agents')({
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
        Autonomous systems — LLM agents, workflow bots, MCP servers, humanoids, smart home hubs — all share one
        dangerous moment: when a <strong>planned action becomes a real side effect</strong>. A runtime trust layer
        exists for that moment alone.
      </p>
      <h2>Execution is the attack surface</h2>
      <p>
        Prompt guardrails filter toxic text. Schema validators check JSON shape. Neither answers:{' '}
        <em>should this email send, this door unlock, this payment execute — right now, from this actor?</em>
      </p>
      <p>
        Sanctum Runtime sits between reasoning and execution. Every action passes through policy and risk scoring.
        The runtime returns <strong>APPROVE</strong>, <strong>REQUIRE_VERIFICATION</strong>, or <strong>BLOCKED</strong>
        — then logs evidence for operators and compliance.
      </p>
      <h2>What a runtime trust layer includes</h2>
      <ul>
        <li><strong>Interception</strong> — one API: verify before execute</li>
        <li><strong>Policy engine</strong> — per-action approve / verify / block</li>
        <li><strong>Human-in-the-loop</strong> — mobile PWA or console for approvals</li>
        <li><strong>Audit trail</strong> — correlation IDs, replay, webhooks</li>
        <li><strong>Local-first risk</strong> — Ollama or heuristics when cloud is down</li>
      </ul>
      <h2>One runtime, twelve categories</h2>
      <p>
        The same gate works for agents, ROS2 fleets, smart locks, industrial lines, and healthcare robotics — you
        define action names; Sanctum enforces policy. See{' '}
        <Link to="/glossary/" className="text-primary hover:underline">glossary</Link> and{' '}
        <Link to={docsPath}>documentation</Link> for integration patterns.
      </p>
      <h2>Start building</h2>
      <pre>
        <code>{`npm install @sanctum-runtime/sdk

const result = await sanctum.verifyAction({
  actor: 'billing-agent',
  action: 'transfer_funds',
  context: { amount: 4500, currency: 'USD' },
})`}</code>
      </pre>
      <p>
        <a href={consoleUrl} className="text-primary hover:underline">Open the console</a> for fleet policy and
        verification queues, or read{' '}
        <Link to={blogPostPath('sanctum-vs-guardrails')} className="text-primary hover:underline">
          Sanctum vs guardrails
        </Link>.
      </p>
    </BlogLayout>
  )
}
