import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'

const slug = 'workflow-automation-ai-governance'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/workflow-automation-ai-governance')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
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
