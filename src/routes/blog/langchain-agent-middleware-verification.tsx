import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { docsPath } from '@/lib/site-links'

const slug = 'langchain-agent-middleware-verification'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/langchain-agent-middleware-verification')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        <strong>LangChain</strong> agents chain tools, memory, and models. The dangerous step is always tool
        execution. Wrap calls with Sanctum — middleware style or <code>protectAgent()</code> from the agent adapter.
      </p>
      <h2>Two integration paths</h2>
      <ol>
        <li><strong>Per-tool wrapper</strong> — verify before each tool.invoke()</li>
        <li><strong>protectAgent()</strong> — adapter hooks the agent loop automatically</li>
      </ol>
      <h2>Policies follow action names</h2>
      <p>
        Map LangChain tool names to Sanctum actions: <code>send_email</code>, <code>run_sql</code>,{' '}
        <code>delete_file</code>. Set verify on destructive ops, approve on reads.
      </p>
      <p>
        <Link to={docsPath} className="text-primary hover:underline">Documentation</Link>
        {' · '}
        <Link to={blogPostPath('mcp-server-action-gate')} className="text-primary hover:underline">MCP gate</Link>
        {' · '}
        <Link to={blogPostPath('ai-agent-action-approval-before-execution')} className="text-primary hover:underline">
          Action approval
        </Link>
      </p>
    </BlogLayout>
  )
}
