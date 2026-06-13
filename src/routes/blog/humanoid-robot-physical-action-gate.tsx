import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'

const slug = 'humanoid-robot-physical-action-gate'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/humanoid-robot-physical-action-gate')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        <strong>Humanoid robots</strong> combine locomotion, manipulation, and human-scale access — doors, tools,
        objects. One poisoned command can move mass in the real world. Physical action gates are mandatory, not
        optional.
      </p>
      <h2>High-risk actions</h2>
      <ul>
        <li><code>unlock_door</code> / building access</li>
        <li><code>handover_object</code> to unknown parties</li>
        <li><code>move_to_location</code> in public spaces</li>
      </ul>
      <h2>Blast radius + dual approver</h2>
      <p>
        Sanctum scores reversibility, physical-world impact, and value. Policies can require{' '}
        <strong>two distinct approvers</strong> for manipulation near humans — with mobile verify for field ops.
      </p>
      <p>
        <Link to={blogPostPath('embodied-ai-robotics-policy-gate')} className="text-primary hover:underline">
          Embodied AI policy gate
        </Link>
        {' · '}
        <Link to={blogPostPath('mobile-pwa-runtime-verification')} className="text-primary hover:underline">
          Mobile verification
        </Link>
        {' · '}
        <Link to="/what-is-sanctum-runtime/" className="text-primary hover:underline">What is Sanctum</Link>
      </p>
    </BlogLayout>
  )
}
