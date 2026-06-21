import { BLOG_ACQUISITION_POSTS } from './blog-acquisition-posts'
import { BLOG_TRENDING_POSTS } from './blog-trending-posts'
import { BLOG_TRANSACTIONAL_POSTS } from './blog-transactional-posts'
import { BLOG_ANSWER_POSTS, type BlogAnswerPost } from './blog-answers'
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
    slug: 'introducing-sanctum-runtime',
    title: 'The execution layer is the new attack surface — and autonomous AI has no trust boundary yet',
    description:
      'The risk shifted from chat outputs to unauthorized execution. Introducing Sanctum Runtime — observe, verify, and gate every autonomous action before it runs.',
    publishedAt: '2026-06-11',
    tags: ['runtime-trust', 'ai-agents', 'ai-infrastructure', 'launch', 'agentic-ai'],
    readTime: 10,
    featured: true,
  },
  {
    slug: 'runtime-trust-layer-for-ai-agents',
    title: 'AI Trust Layer for Agents: Runtime Verification Explained',
    description:
      'A runtime trust layer gates every side effect — APPROVE, REQUIRE_VERIFICATION, or BLOCKED — before APIs, devices, and robots execute.',
    publishedAt: '2026-05-20',
    tags: ['ai-agents', 'runtime-trust', 'policy-engine', 'human-in-the-loop'],
    readTime: 8,
    featured: true,
  },
  {
    slug: 'ai-agent-action-approval-before-execution',
    title: 'AI Agent Action Approval: Gate Side Effects Before Execution',
    description:
      'Approve, verify, or block tool calls, API writes, and file ops with verifyAction(). Patterns for LangChain, MCP, and custom agents.',
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
  {
    slug: 'what-is-ai-agent-observability-vs-control',
    title: 'AI agent observability vs control: what actually prevents incidents?',
    description:
      'Observability helps you investigate. Runtime control prevents irreversible side effects before they run. Learn how leading teams combine both in production.',
    publishedAt: '2026-05-27',
    tags: ['ai-agents', 'observability', 'runtime-trust', 'security'],
    readTime: 6,
    featured: true,
  },
  {
    slug: 'how-to-stop-ai-agents-from-sending-emails-without-approval',
    title: 'Stop AI Agents Sending Emails Without Approval (2026)',
    description:
      'Prompt rules fail. Route send_email through runtime policy gates, human verification, and SLA escalation — with audit trails operators can defend.',
    publishedAt: '2026-05-27',
    tags: ['ai-agents', 'human-in-the-loop', 'email-automation', 'policy-engine'],
    readTime: 6,
  },
  {
    slug: 'can-ai-agents-be-soc2-compliant',
    title: 'Can AI Agents Be SOC 2 Compliant? (Practical Answer)',
    description:
      'Map runtime controls, approval logs, policy versions, and exportable evidence to SOC 2 expectations for autonomous systems.',
    publishedAt: '2026-05-27',
    tags: ['soc2', 'compliance', 'ai-governance', 'audit-log'],
    readTime: 7,
  },
  {
    slug: 'mcp-server-security-checklist-2026',
    title: 'MCP Server Security Best Practices & Checklist (2026)',
    description:
      'Lock down MCP servers first: tool poisoning, argument validation, least privilege, dispatcher hardening, and pre-execution policy gates.',
    publishedAt: '2026-05-27',
    tags: ['mcp', 'llm-security', 'tool-use', 'prompt-injection'],
    readTime: 7,
  },
  {
    slug: 'what-is-human-in-the-loop-for-ai-agents',
    title: 'What is human-in-the-loop for AI agents? (real enforcement edition)',
    description:
      'HITL is not a prompt suggestion. It is an execution pause outside the model with approve, block, and escalation paths.',
    publishedAt: '2026-05-27',
    tags: ['human-in-the-loop', 'ai-agents', 'verification', 'operations'],
    readTime: 6,
  },
  {
    slug: 'how-to-approve-ai-agent-actions-on-mobile',
    title: 'How to approve AI agent actions on mobile',
    description:
      'Installable PWA + push notifications let operators review and resolve high-risk AI actions from phone or desktop with full auditability.',
    publishedAt: '2026-05-27',
    tags: ['pwa', 'mobile', 'human-in-the-loop', 'operations'],
    readTime: 5,
  },
  {
    slug: 'can-you-run-ai-agent-security-offline',
    title: 'Can you run AI agent security offline?',
    description:
      'Yes. Keep deterministic policy gates offline, add local model scoring, and define strict fallback behavior for disconnected environments.',
    publishedAt: '2026-05-27',
    tags: ['offline', 'local-llm', 'sovereign-ai', 'runtime-trust'],
    readTime: 6,
  },
  {
    slug: 'how-to-prevent-ai-agent-data-exfiltration',
    title: 'Prevent AI Agent Data Exfiltration: 7 Controls That Work',
    description:
      'Stop exfiltration chains with least-privilege tools, source-trust classification, export gates, and human verification for outbound transfers.',
    publishedAt: '2026-05-27',
    tags: ['data-security', 'llm-security', 'policy-engine', 'ai-agents'],
    readTime: 7,
  },
  {
    slug: 'what-is-confused-deputy-in-ai-agents',
    title: 'Confused Deputy in AI Agents: What It Is & How to Stop It',
    description:
      'Untrusted intent can hijack trusted credentials in MCP and agent systems. Runtime authorization patterns that break the attack path.',
    publishedAt: '2026-05-27',
    tags: ['security', 'ai-agents', 'mcp', 'runtime-trust'],
    readTime: 6,
  },
  {
    slug: 'ai-agent-kill-switch-best-practices',
    title: 'AI agent kill switch best practices for incident response',
    description:
      'Design a fast, auditable containment switch that stops state-changing actions across fleets while preserving visibility for triage.',
    publishedAt: '2026-05-27',
    tags: ['incident-response', 'fleet', 'ai-safety', 'operations'],
    readTime: 6,
  },
  {
    slug: 'runtime-authorization-vs-guardrails-explained',
    title: 'What Is Runtime Authorization? (vs Guardrails, Explained)',
    description:
      'Runtime authorization controls side effects before they execute. Guardrails filter language. Learn why production teams need both layers.',
    publishedAt: '2026-05-27',
    tags: ['guardrails', 'runtime-trust', 'ai-safety', 'comparison'],
    readTime: 6,
  },
  {
    slug: 'how-to-audit-ai-agent-decisions',
    title: 'How to audit AI agent decisions (and prove controls worked)',
    description:
      'Build replayable decision trails with policy versioning, correlation IDs, and execution receipts for compliance and incident review.',
    publishedAt: '2026-05-27',
    tags: ['audit-log', 'compliance', 'ai-governance', 'verification'],
    readTime: 7,
  },
  {
    slug: 'can-openai-claude-gemini-share-one-agent-control-plane',
    title: 'Can OpenAI, Claude, and Gemini share one agent control plane?',
    description:
      'Yes — if you normalize action events and enforce policy at execution time instead of coupling controls to one model provider.',
    publishedAt: '2026-05-27',
    tags: ['openai', 'claude', 'gemini', 'ai-agents'],
    readTime: 7,
  },
  {
    slug: 'ai-agent-rbac-for-tool-permissions',
    title: 'AI agent RBAC for tool permissions: practical design',
    description:
      'Enforce role-based permissions where it matters: at tool execution with actor, org, and scope context in every action check.',
    publishedAt: '2026-05-27',
    tags: ['rbac', 'tool-use', 'security', 'ai-agents'],
    readTime: 6,
  },
  {
    slug: 'ai-agent-incident-response-runbook',
    title: 'AI agent incident response runbook: contain, investigate, recover',
    description:
      'A practical runbook for autonomous-system incidents: kill switch, evidence capture, replay, policy updates, and staged recovery.',
    publishedAt: '2026-05-27',
    tags: ['incident-response', 'operations', 'ai-safety', 'audit-log'],
    readTime: 7,
  },
  {
    slug: 'how-to-validate-tool-arguments-in-mcp',
    title: 'How to Validate MCP Tool Arguments (2026 Security Guide)',
    description:
      '7-step checklist: schema validation, path allowlists, range checks, and pre-execution gates. Stop confused-deputy paths before MCP tools run.',
    publishedAt: '2026-05-27',
    tags: ['mcp', 'input-validation', 'security', 'tool-use'],
    readTime: 6,
  },
  {
    slug: 'ai-agent-approval-sla-and-escalation-design',
    title: 'AI agent approval SLA and escalation design',
    description:
      'Design approval queues that do not stall operations: SLA tiers, backup approvers, timeout policy, and mobile response patterns.',
    publishedAt: '2026-05-27',
    tags: ['human-in-the-loop', 'operations', 'workflow', 'ai-governance'],
    readTime: 6,
  },
  {
    slug: 'ai-agent-policy-versioning-and-replay',
    title: 'AI agent policy versioning and replay: why teams need both',
    description:
      'Version every policy change and replay historical decisions to verify safer behavior before rollout.',
    publishedAt: '2026-05-27',
    tags: ['policy-engine', 'replay', 'compliance', 'ai-governance'],
    readTime: 6,
  },
  {
    slug: 'safe-ai-agent-automation-for-crm-and-slack',
    title: 'Safe AI agent automation for CRM and Slack workflows',
    description:
      'Keep workflow speed while controlling business risk: verify high-impact actions before posting, updating, or sending.',
    publishedAt: '2026-05-27',
    tags: ['workflow', 'automation', 'slack', 'crm'],
    readTime: 6,
  },
  {
    slug: 'ai-agent-security-checklist-for-production',
    title: 'AI agent security checklist for production teams',
    description:
      'A practical production baseline: execution gates, approvals, least privilege, replay, kill switch, and incident drills.',
    publishedAt: '2026-05-27',
    tags: ['security-checklist', 'ai-agents', 'runtime-trust', 'operations'],
    readTime: 7,
  },
  {
    slug: 'what-is-agentic-ai-risk-management',
    title: 'Agentic AI Risk Management: Framework for Production Teams',
    description:
      'Govern autonomous AI across planning, verification, approval, execution, and audit. Action-centric risk management — not prompt safety alone.',
    publishedAt: '2026-05-27',
    tags: ['ai-governance', 'risk-management', 'ai-agents', 'compliance'],
    readTime: 6,
  },
  {
    slug: 'best-practices-for-ai-agent-tool-calling',
    title: 'AI Agent Tool Calling Best Practices for Production (2026)',
    description:
      'Standardize tool wrappers, validate arguments, bind approvals to signed tokens, and log execution receipts — patterns that scale.',
    publishedAt: '2026-05-27',
    tags: ['tool-use', 'ai-agents', 'sdk', 'security'],
    readTime: 6,
  },
  {
    slug: 'how-to-design-ai-agent-policies-that-scale',
    title: 'How to design AI agent policies that scale',
    description:
      'Build policy systems that stay usable as teams grow: action taxonomy, risk tiers, versioning, and replay-based improvement.',
    publishedAt: '2026-05-27',
    tags: ['policy-engine', 'ai-governance', 'operations', 'scaling'],
    readTime: 7,
  },
  ...BLOG_TRENDING_POSTS,
  ...BLOG_TRANSACTIONAL_POSTS,
  ...BLOG_ACQUISITION_POSTS,
]

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}

const FALLBACK_KEY_POINTS = [
  'Control must run at execution time, not only in prompts or post-hoc dashboards.',
  'Policies should be explicit, versioned, and mapped to business risk.',
  'Use Sanctum Runtime to enforce safe outcomes without spammy UX.',
]

const FALLBACK_CHECKLIST = [
  'Classify actions by impact and irreversibility.',
  'Route risky actions to verification with clear operator context.',
  'Log decisions and execution receipts for replay and compliance.',
]

const FALLBACK_ANSWERS: BlogAnswerPost['answers'] = [
  {
    question: 'How do we lower risk without slowing teams down?',
    answer:
      'Use risk-tiered policy so only high-impact actions require human verification, while low-risk actions continue automatically with audit.',
  },
  {
    question: 'What should we implement first?',
    answer:
      'Start with pre-execution gating for irreversible actions, then add approval SLA, escalation, and policy replay.',
  },
  {
    question: 'Where does Sanctum fit?',
    answer:
      'Sanctum sits at the action boundary so teams can approve, verify, or block side effects before execution with clear audit evidence.',
  },
]

/** Resolve article body — explicit entry or synthesized fallback from post metadata. */
export function getBlogAnswerPost(slug: string): BlogAnswerPost | undefined {
  const existing = BLOG_ANSWER_POSTS[slug]
  if (existing) return existing
  const post = getBlogPost(slug)
  if (!post) return undefined
  return {
    intro: post.description,
    keyPoints: FALLBACK_KEY_POINTS,
    checklist: FALLBACK_CHECKLIST,
    answers: FALLBACK_ANSWERS,
    related: ['runtime-trust-layer-for-ai-agents', 'ai-agent-security-checklist-for-production'],
  }
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`
}

/** Blog index — no trailing slash (matches router trailingSlash: never). */
export const blogIndexPath = '/blog'
