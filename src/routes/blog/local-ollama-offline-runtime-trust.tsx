import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { githubUrl } from '@/lib/site-links'

const slug = 'local-ollama-offline-runtime-trust'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/local-ollama-offline-runtime-trust')({
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
        Sovereign AI means data and decisions stay on your hardware. <strong>Ollama</strong> runs local risk models;
        Sanctum falls back to <strong>offline heuristics</strong> when the network drops — policies and audit still
        work.
      </p>
      <h2>Stack</h2>
      <ul>
        <li>Sanctum Runtime API on edge or laptop</li>
        <li>Ollama (e.g. qwen2.5) for semantic risk scoring</li>
        <li>Heuristic floor when model unavailable</li>
        <li>FORCE_OFFLINE_MODE for drills and air-gapped labs</li>
      </ul>
      <h2>Who benefits</h2>
      <p>
        Robotics in warehouses, defense edge, healthcare on-prem, and developers who refuse to send action metadata
        to third-party clouds.
      </p>
      <p>
        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Clone the OSS runtime
        </a>
        {' · '}
        <Link to={blogPostPath('ros2-safety-policy-runtime')} className="text-primary hover:underline">ROS2 safety</Link>
      </p>
    </BlogLayout>
  )
}
