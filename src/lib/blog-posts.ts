/** Blog registry — add posts here + a matching route under src/routes/blog/ */

export type BlogPostMeta = {
  slug: string
  title: string
  description: string
  publishedAt: string
  updatedAt?: string
  tags: string[]
  /** minutes */
  readTime: number
  featured?: boolean
}

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: 'runtime-trust-layer-for-ai-agents',
    title: 'What is a runtime trust layer for AI agents?',
    description:
      'Why execution-time verification beats chat guardrails for agents, robots, and workflows — and how Sanctum gates actions before they run.',
    publishedAt: '2026-05-20',
    tags: ['ai-agents', 'runtime-trust', 'policy-engine', 'human-in-the-loop'],
    readTime: 8,
    featured: true,
  },
  {
    slug: 'ai-agent-action-approval-before-execution',
    title: 'AI agent action approval: gate side effects before execution',
    description:
      'Approve, verify, or block tool calls, API writes, and file operations with a single verifyAction() — patterns for LangChain, MCP, and custom agents.',
    publishedAt: '2026-05-19',
    tags: ['ai-agents', 'tool-use', 'verification', 'sdk'],
    readTime: 7,
    featured: true,
  },
  {
    slug: 'embodied-ai-robotics-policy-gate',
    title: 'Embodied AI and robotics: policy gates for physical actions',
    description:
      'Humanoids, ROS2, smart home, and industrial systems need the same trust boundary — intercept unlock_door, move_robot, and emergency_stop before motors run.',
    publishedAt: '2026-05-18',
    tags: ['robotics', 'embodied-ai', 'smart-home', 'humanoids'],
    readTime: 9,
    featured: true,
  },
  {
    slug: 'sanctum-vs-guardrails',
    title: 'Sanctum Runtime vs guardrails: what the model says vs what it does',
    description:
      'Content moderation protects chat. Runtime trust protects execution. When to use both — and why autonomous systems need a boundary at the action layer.',
    publishedAt: '2026-05-17',
    tags: ['guardrails', 'llm-security', 'comparison', 'ai-safety'],
    readTime: 6,
  },
  {
    slug: 'mobile-pwa-runtime-verification',
    title: 'Mobile runtime verification: PWA companion for human-in-the-loop',
    description:
      'Turn the operator console into an installable mobile trust layer — push alerts, approve verifications, and supervise autonomous systems from your phone.',
    publishedAt: '2026-05-16',
    tags: ['pwa', 'mobile', 'verification', 'human-in-the-loop'],
    readTime: 5,
  },
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`
}
