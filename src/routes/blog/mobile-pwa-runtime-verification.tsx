import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { consoleUrl } from '@/lib/site-links'

const slug = 'mobile-pwa-runtime-verification'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/mobile-pwa-runtime-verification')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        Autonomous systems run 24/7. Operators do not. A <strong>mobile runtime verification</strong> layer —
        installable PWA, push alerts, one-tap approve/deny — turns your phone into the human control plane for AI
        and robotics.
      </p>
      <h2>Why mobile matters for trust</h2>
      <ul>
        <li>Verification requests arrive when you are away from desk</li>
        <li>Push: “Agent requested unlock_door — VERIFY”</li>
        <li>Same policy engine on server; phone supervises, does not replace runtime</li>
      </ul>
      <h2>Sanctum Mobile Companion</h2>
      <p>
        Install <a href={consoleUrl} className="text-primary hover:underline">console.sanctumruntime.com</a> to your
        home screen. Trust score, live activity feed, and verification modal — without a separate App Store app.
      </p>
      <h2>Architecture</h2>
      <p>
        Runtime stays local or on your API. The PWA connects over HTTPS, subscribes to push (FCM), and resolves
        verifications against the same audit log as desktop.
      </p>
      <p>
        <Link to={blogPostPath('ai-agent-action-approval-before-execution')} className="text-primary hover:underline">
          Action approval patterns
        </Link>
        {' · '}
        <Link to="/docs" className="text-primary hover:underline">Docs</Link>
      </p>
    </BlogLayout>
  )
}
