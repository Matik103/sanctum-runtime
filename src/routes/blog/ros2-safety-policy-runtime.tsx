import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'

const slug = 'ros2-safety-policy-runtime'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/ros2-safety-policy-runtime')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p>
        <strong>ROS2</strong> fleets depend on timely commands — and timely stops. A safety policy runtime sits
        between your planner and the motor stack, authorizing navigation, manipulation, and safety-critical actions.
      </p>
      <h2>Example policies</h2>
      <ul>
        <li><code>navigate</code> → verify in human-proximity zones</li>
        <li><code>emergency_stop</code> → always approve</li>
        <li><code>dock</code> → approve when battery low</li>
        <li><code>calibrate_arm</code> → verify unless maintenance mode</li>
      </ul>
      <h2>Edge and offline</h2>
      <p>
        Warehouses lose Wi-Fi. Sanctum runs heuristics and local Ollama risk on the edge node so gates stay closed
        when cloud is down — see{' '}
        <Link to={blogPostPath('local-ollama-offline-runtime-trust')} className="text-primary hover:underline">
          offline runtime trust
        </Link>.
      </p>
      <p>
        <Link to={blogPostPath('embodied-ai-robotics-policy-gate')} className="text-primary hover:underline">
          Embodied AI policy gate
        </Link>
        {' · '}
        <Link to="/architecture" className="text-primary hover:underline">Architecture</Link>
      </p>
    </BlogLayout>
  )
}
