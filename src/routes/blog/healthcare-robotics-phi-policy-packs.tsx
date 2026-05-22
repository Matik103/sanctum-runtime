import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { consoleUrl } from '@/lib/site-links'

const slug = 'healthcare-robotics-phi-policy-packs'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/healthcare-robotics-phi-policy-packs')({
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
        Hospital robots and assistive systems touch <strong>PHI</strong> and physical patients. Policies must
        combine role checks, patient zone context, and verify for record access or cross-ward motion.
      </p>
      <h2>Marketplace policy packs</h2>
      <p>
        Install healthcare templates from the Sanctum marketplace — baseline rules for dispense, bed motion, and
        record read — then customize per facility in the{' '}
        <a href={consoleUrl} className="text-primary hover:underline">console</a>.
      </p>
      <h2>Audit for compliance</h2>
      <p>
        Every decision logged with correlation IDs supports HIPAA-oriented reviews alongside{' '}
        <Link to={blogPostPath('soc2-nist-ai-rmf-runtime-evidence')} className="text-primary hover:underline">
          SOC2 / NIST evidence
        </Link>.
      </p>
      <p>
        <Link to={blogPostPath('embodied-ai-robotics-policy-gate')} className="text-primary hover:underline">
          Embodied AI gates
        </Link>
      </p>
    </BlogLayout>
  )
}
