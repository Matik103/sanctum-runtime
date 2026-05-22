import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'

const slug = 'embodied-ai-robotics-policy-gate'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/embodied-ai-robotics-policy-gate')({
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
        <strong>Embodied AI</strong> closes the loop between perception and physics. Trust failures are not abstract —
        they are doors, arms, drones, and production lines. A <strong>policy gate</strong> at the action layer is
        non-negotiable for field deployment.
      </p>
      <h2>Physical actions need named policies</h2>
      <ul>
        <li><code>unlock_door</code> → verify when owner away or off-hours</li>
        <li><code>move_robot</code> → verify in human-proximity zones</li>
        <li><code>emergency_stop</code> → always approve (safety override)</li>
        <li><code>disable_alarm</code> → block without dual approval</li>
      </ul>
      <h2>ROS2, humanoids, smart home — same API</h2>
      <p>
        Sanctum does not replace your motion stack. It authorizes commands before they reach motors, APIs, or
        Zigbee bridges. Marketplace adapters ship templates for ROS2, humanoid hosts, and smart-home hubs.
      </p>
      <h2>Offline and edge</h2>
      <p>
        Warehouses and homes lose connectivity. Local heuristics and Ollama risk scoring keep the gate running
        without cloud dependency — critical for sovereign and edge robotics.
      </p>
      <p>
        Related:{' '}
        <Link to="/architecture" className="text-primary hover:underline">architecture</Link>,{' '}
        <Link to={blogPostPath('mobile-pwa-runtime-verification')} className="text-primary hover:underline">
          mobile verification companion
        </Link>.
      </p>
    </BlogLayout>
  )
}
