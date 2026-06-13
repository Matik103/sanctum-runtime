import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { githubUrl } from '@/lib/site-links'

const slug = 'ai-agent-action-approval-before-execution'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/ai-agent-action-approval-before-execution')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        Tool-using agents are production systems. Each tool call is a commit: send Slack, delete repo, charge a card.
        <strong> Action approval before execution</strong> is how you keep autonomy without blind trust.
      </p>
      <h2>The three decisions</h2>
      <ul>
        <li><strong>Approve</strong> — low risk, policy allows, execute immediately</li>
        <li><strong>Verify</strong> — hold until a human approves (console or mobile PWA)</li>
        <li><strong>Block</strong> — deny and log; optionally alert ops</li>
      </ul>
      <h2>Integration patterns</h2>
      <p><strong>Middleware</strong> — wrap every tool executor with verifyAction().</p>
      <p><strong>protectAgent()</strong> — agent adapter for LangChain-style loops.</p>
      <p><strong>Webhooks</strong> — fire verification.required to Slack or PagerDuty.</p>
      <h2>Example: high-value transfer</h2>
      <pre>
        <code>{`// Policy: transfer_funds → REQUIRE_VERIFICATION
// Runtime holds until operator approves in console or mobile app
// Audit row: actor, risk score, decision, timestamp`}</code>
      </pre>
      <p>
        Clone the open-source runtime on{' '}
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          GitHub
        </a>
        {' '}or read{' '}
        <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
          what is a runtime trust layer
        </Link>.
      </p>
    </BlogLayout>
  )
}
