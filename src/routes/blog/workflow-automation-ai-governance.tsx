import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'

const slug = 'workflow-automation-ai-governance'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/workflow-automation-ai-governance')({
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
        <strong>n8n</strong>, Zapier-style flows, and <strong>CrewAI</strong> crews automate business processes with
        AI steps. Each step that touches CRM, finance, or infra is an action — gate it like any agent tool.
      </p>
      <h2>One API for workflows</h2>
      <pre>
        <code>{`await sanctum.verifyAction({
  actor: 'finance-crew',
  action: 'post_slack',
  context: { channel: '#payments', amount: 12000 },
})`}</code>
      </pre>
      <h2>Governance wins</h2>
      <ul>
        <li>Quota and anomaly alerts to ops</li>
        <li>Verification queue for high-value transfers</li>
        <li>Audit export for SOX-style reviews</li>
      </ul>
      <p>
        <Link to={blogPostPath('ai-agent-action-approval-before-execution')} className="text-primary hover:underline">
          Action approval
        </Link>
        {' · '}
        <Link to="/enterprise" className="text-primary hover:underline">Enterprise</Link>
      </p>
    </BlogLayout>
  )
}
