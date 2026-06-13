import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'

const slug = 'smart-home-ai-unlock-door-policy'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/smart-home-ai-unlock-door-policy')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        “Unlock the front door” from a voice assistant is a <strong>physical side effect</strong>. Smart home AI
        must treat locks, alarms, and thermostats like production APIs — with policies and human verify when context
        is wrong.
      </p>
      <h2>Recommended policies</h2>
      <ul>
        <li><code>unlock_door</code> → REQUIRE_VERIFICATION if owner away or off-hours</li>
        <li><code>disable_alarm</code> → verify always</li>
        <li><code>set_thermostat</code> → approve within normal bands</li>
      </ul>
      <h2>Local-first</h2>
      <p>
        Homes lose internet. Run Sanctum on a home hub with offline heuristics so poisoned prompts cannot open
        doors when cloud moderation is unreachable.
      </p>
      <p>
        <Link to={blogPostPath('embodied-ai-robotics-policy-gate')} className="text-primary hover:underline">
          Embodied AI gates
        </Link>
        {' · '}
        <Link to={blogPostPath('mobile-pwa-runtime-verification')} className="text-primary hover:underline">
          Mobile verify
        </Link>
      </p>
    </BlogLayout>
  )
}
