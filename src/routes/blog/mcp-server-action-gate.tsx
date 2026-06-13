import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { docsPath, githubUrl } from '@/lib/site-links'

const slug = 'mcp-server-action-gate'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/mcp-server-action-gate')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        <strong>Model Context Protocol (MCP)</strong> gives LLMs structured access to tools — files, databases,
        browsers, smart devices. Each tool call is an execution event. Sanctum gates MCP actions before your server
        runs them.
      </p>
      <h2>Why MCP needs a runtime gate</h2>
      <ul>
        <li>Tools can delete files, exfiltrate secrets, or call production APIs</li>
        <li>Indirect prompt injection arrives through tool output, not user chat</li>
        <li>Multiple clients may share one MCP server — policies must be per actor and org</li>
      </ul>
      <h2>Integration pattern</h2>
      <pre>
        <code>{`// Before MCP tool executes:
const result = await sanctum.verifyAction({
  actor: 'mcp-host',
  action: 'write_file',
  context: { path: '/etc/hosts', source_trust: 'tool_output' },
})
if (result.decision !== 'APPROVED') return heldOrBlocked`}</code>
      </pre>
      <p>
        Sanctum ships an MCP marketplace adapter. See{' '}
        <Link to={docsPath} className="text-primary hover:underline">docs</Link> and the{' '}
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          GitHub repo
        </a>.
      </p>
      <p>
        Related:{' '}
        <Link to={blogPostPath('indirect-prompt-injection-source-trust')} className="text-primary hover:underline">
          source-trust classification
        </Link>
        ,{' '}
        <Link to={blogPostPath('ai-agent-action-approval-before-execution')} className="text-primary hover:underline">
          action approval
        </Link>.
      </p>
    </BlogLayout>
  )
}
