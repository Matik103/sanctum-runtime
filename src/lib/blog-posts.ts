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
  {
    slug: 'mcp-server-action-gate',
    title: 'MCP server action gate: verify Model Context Protocol tools before execution',
    description:
      'MCP connects LLMs to filesystems, APIs, and devices. Gate every tool call with Sanctum — approve, verify, or block before the server executes.',
    publishedAt: '2026-05-21',
    tags: ['mcp', 'ai-agents', 'tool-use', 'llm-security'],
    readTime: 7,
    featured: true,
  },
  {
    slug: 'ros2-safety-policy-runtime',
    title: 'ROS2 safety policy runtime: gate robot commands before the stack runs',
    description:
      'Navigation, manipulation, and safety interlocks need a trust layer. Intercept ROS2 actions with policies — verify hazardous moves, always approve e-stop.',
    publishedAt: '2026-05-15',
    tags: ['ros2', 'robotics', 'safety', 'embodied-ai'],
    readTime: 8,
  },
  {
    slug: 'soc2-nist-ai-rmf-runtime-evidence',
    title: 'SOC2 and NIST AI RMF: runtime evidence from your action gate',
    description:
      'Map GOVERN, MAP, MEASURE, and MANAGE controls to signed action tokens, audit logs, and policy replay — exportable evidence for compliance reviews.',
    publishedAt: '2026-05-14',
    tags: ['soc2', 'compliance', 'ai-governance', 'audit-log'],
    readTime: 8,
  },
  {
    slug: 'fleet-kill-switch-autonomous-systems',
    title: 'Fleet kill switch: pause every autonomous agent in one operator action',
    description:
      'When incident response matters, org-wide kill switch returns BLOCKED on every verify until you resume — agents, robots, and workflows stop side effects immediately.',
    publishedAt: '2026-05-13',
    tags: ['fleet', 'ai-safety', 'operations', 'human-in-the-loop'],
    readTime: 6,
  },
  {
    slug: 'langchain-agent-middleware-verification',
    title: 'LangChain agent middleware: verify tools before your chain executes',
    description:
      'Wrap LangChain tool calls with Sanctum verifyAction() or protectAgent() — policies, human approval, and audit without rewriting your agent graph.',
    publishedAt: '2026-05-12',
    tags: ['langchain', 'ai-agents', 'middleware', 'sdk'],
    readTime: 7,
  },
  {
    slug: 'smart-home-ai-unlock-door-policy',
    title: 'Smart home AI: unlock_door policies and local verification',
    description:
      'Voice assistants and home agents must not unlock doors on poisoned prompts. Policy-gate lock, alarm, and thermostat actions with context-aware verify.',
    publishedAt: '2026-05-11',
    tags: ['smart-home', 'iot', 'policy-engine', 'verification'],
    readTime: 6,
  },
  {
    slug: 'signed-action-tokens-executor-verification',
    title: 'Signed action tokens: HMAC proof before executors run side effects',
    description:
      'Approving in Sanctum is not enough — executors must verify a short-lived HMAC token scoped to actor, action, and audit ID before any real-world effect.',
    publishedAt: '2026-05-10',
    tags: ['security', 'tokens', 'runtime-trust', 'sdk'],
    readTime: 7,
  },
  {
    slug: 'indirect-prompt-injection-source-trust',
    title: 'Indirect prompt injection defense with source-trust classification',
    description:
      'Tool output and untrusted content can hijack agents. Source-trust levels let policies treat tool_output and untrusted_content as higher risk automatically.',
    publishedAt: '2026-05-09',
    tags: ['llm-security', 'prompt-injection', 'ai-agents', 'policy-engine'],
    readTime: 7,
  },
  {
    slug: 'local-ollama-offline-runtime-trust',
    title: 'Local Ollama and offline runtime trust for sovereign AI',
    description:
      'Run risk scoring with Ollama on-device, fall back to heuristics when disconnected — policies and audit without sending actions to the cloud.',
    publishedAt: '2026-05-08',
    tags: ['ollama', 'local-llm', 'offline', 'sovereign-ai'],
    readTime: 6,
  },
  {
    slug: 'workflow-automation-ai-governance',
    title: 'Workflow automation governance: n8n, CrewAI, and enterprise AI ops',
    description:
      'Automations that post to Slack, update CRMs, or trigger scripts need the same gate as agents. One verifyAction() API for workflow steps and multi-agent crews.',
    publishedAt: '2026-05-07',
    tags: ['workflow', 'automation', 'crewai', 'ai-governance'],
    readTime: 6,
  },
  {
    slug: 'healthcare-robotics-phi-policy-packs',
    title: 'Healthcare robotics: PHI policy packs and role-based verify',
    description:
      'Dispense, bed motion, and record access require HIPAA-aware policies. Install marketplace packs and require verify for cross-patient actions.',
    publishedAt: '2026-05-06',
    tags: ['healthcare', 'robotics', 'compliance', 'policy-engine'],
    readTime: 7,
  },
  {
    slug: 'humanoid-robot-physical-action-gate',
    title: 'Humanoid robots: physical action gates for manipulation and access',
    description:
      'Humanoids blend navigation, grasp, and building access. Gate unlock, handover, and locomotion with blast-radius scoring and dual-approver for high-risk moves.',
    publishedAt: '2026-05-05',
    tags: ['humanoids', 'embodied-ai', 'robotics', 'verification'],
    readTime: 8,
  },
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`
}
