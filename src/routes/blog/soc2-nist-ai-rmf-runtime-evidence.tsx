import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { consoleUrl } from '@/lib/site-links'

const slug = 'soc2-nist-ai-rmf-runtime-evidence'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/soc2-nist-ai-rmf-runtime-evidence')({
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
        Auditors ask: <em>how do you control what AI systems actually do?</em> Chat logs are not enough.{' '}
        <strong>Runtime evidence</strong> — per-action decisions, signed tokens, immutable audit — maps cleanly to
        SOC2 and the NIST AI Risk Management Framework.
      </p>
      <h2>What Sanctum exports</h2>
      <ul>
        <li>Audit events with actor, action, risk score, decision, timestamp</li>
        <li>Policy version history and replay (“what if today’s policies existed yesterday?”)</li>
        <li>Governance workflows: dual approver, delegation, compliance columns</li>
        <li>16 mapped controls with implementation evidence in the OSS runtime</li>
      </ul>
      <h2>MEASURE and MANAGE</h2>
      <p>
        MEASURE: anomaly flags, blocked chains, verification latency. MANAGE: kill switch, escalation, human
        resolution trails in the{' '}
        <a href={consoleUrl} className="text-primary hover:underline">operator console</a>.
      </p>
      <p>
        <Link to="/security" className="text-primary hover:underline">Security overview</Link>
        {' · '}
        <Link to={blogPostPath('signed-action-tokens-executor-verification')} className="text-primary hover:underline">
          Signed action tokens
        </Link>
      </p>
    </BlogLayout>
  )
}
