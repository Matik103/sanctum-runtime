import { BLOG_POSTS, type BlogPostMeta } from './blog-posts'

export type BlogHub = {
  id: string
  title: string
  description: string
  anchorSlug: string
  slugs: string[]
  /** Tags used to auto-assign posts not explicitly listed. */
  matchTags?: string[]
}

export const BLOG_HUBS: BlogHub[] = [
  {
    id: 'agentic-risk',
    title: 'Agentic AI risk management',
    description:
      'Frameworks, policies, and runtime controls for governing autonomous AI decisions — from risk tiers to audit evidence.',
    anchorSlug: 'what-is-agentic-ai-risk-management',
    matchTags: ['ai-governance', 'risk-management', 'policy-engine', 'ai-safety', 'guardrails', 'llm-security'],
    slugs: [
      'what-is-agentic-ai-risk-management',
      'how-to-design-ai-agent-policies-that-scale',
      'ai-agent-security-checklist-for-production',
      'what-is-ai-agent-observability-vs-control',
      'ai-agent-governance-for-finance-teams',
      'from-observability-to-runtime-enforcement',
      'ai-agent-trust-framework-for-enterprises',
      'map-agent-actions-to-business-risk',
    ],
  },
  {
    id: 'mcp-security',
    title: 'MCP security',
    description:
      'Harden Model Context Protocol servers: argument validation, confused-deputy defense, checklists, and pre-execution gates.',
    anchorSlug: 'mcp-server-security-checklist-2026',
    matchTags: ['mcp', 'tool-use', 'input-validation', 'supply-chain'],
    slugs: [
      'mcp-server-security-checklist-2026',
      'how-to-validate-tool-arguments-in-mcp',
      'what-is-confused-deputy-in-ai-agents',
      'mcp-server-action-gate',
      'indirect-prompt-injection-source-trust',
      'google-agent-gateway-mcp-security-2026',
      'mcp-payment-tools-security',
      'mcp-security-platform-for-production-teams',
      'mcp-registry-third-party-server-trust',
    ],
  },
  {
    id: 'runtime-authorization',
    title: 'Runtime authorization',
    description:
      'Execution-time trust layers, guardrails vs authorization, signed tokens, and cross-provider control planes.',
    anchorSlug: 'runtime-authorization-vs-guardrails-explained',
    matchTags: ['runtime-trust', 'verification', 'tokens', 'open-core'],
    slugs: [
      'runtime-authorization-vs-guardrails-explained',
      'runtime-trust-layer-for-ai-agents',
      'sanctum-vs-guardrails',
      'signed-action-tokens-executor-verification',
      'can-openai-claude-gemini-share-one-agent-control-plane',
      'best-practices-for-ai-agent-tool-calling',
      'langchain-agent-middleware-verification',
      'local-ollama-offline-runtime-trust',
      'connect-agent-openai-claude-gemini-unified',
    ],
  },
  {
    id: 'agentic-commerce',
    title: 'Agentic commerce & fraud',
    description:
      'Fraud prevention, chargebacks, wallet segmentation, and shadow-agent containment for autonomous purchasing.',
    anchorSlug: 'agentic-commerce-fraud-prevention',
    matchTags: ['agentic-commerce', 'payments', 'fraud', 'ecommerce', 'wallets', 'trading'],
    slugs: [
      'agentic-commerce-fraud-prevention',
      'chargebacks-and-ai-agent-transactions',
      'shadow-ai-agents-and-unauthorized-purchases',
      'ai-agent-spending-limits-and-wallet-segmentation',
      'ai-agent-credit-card-safety-checklist',
      'red-teaming-agentic-commerce-scenarios',
      'secure-agent-wallet-architecture',
      'can-ai-agents-buy-online-safely',
      'prompt-injection-in-shopping-agents',
    ],
  },
  {
    id: 'hitl-approvals',
    title: 'Human-in-the-loop approvals',
    description:
      'Approval workflows, mobile verification, SLA design, and platform comparisons for production agent teams.',
    anchorSlug: 'ai-agent-action-approval-before-execution',
    matchTags: ['human-in-the-loop', 'pwa', 'mobile', 'dual-approval', 'workflow'],
    slugs: [
      'ai-agent-action-approval-before-execution',
      'what-is-human-in-the-loop-for-ai-agents',
      'how-to-approve-ai-agent-actions-on-mobile',
      'ai-agent-approval-sla-and-escalation-design',
      'how-to-stop-ai-agents-from-sending-emails-without-approval',
      'best-human-in-the-loop-approval-software-2026',
      'ai-agent-approval-platform-comparison-2026',
      'mobile-pwa-runtime-verification',
      'timeout-should-not-mean-auto-approval',
    ],
  },
  {
    id: 'soc2-compliance',
    title: 'SOC 2 & compliance evidence',
    description:
      'SOC 2 readiness, NIST AI RMF mapping, audit trails, and exportable runtime evidence for autonomous systems.',
    anchorSlug: 'can-ai-agents-be-soc2-compliant',
    matchTags: ['soc2', 'compliance', 'audit-log', 'hipaa', 'fintech', 'insurance'],
    slugs: [
      'can-ai-agents-be-soc2-compliant',
      'soc2-nist-ai-rmf-runtime-evidence',
      'how-to-audit-ai-agent-decisions',
      'get-soc2-ready-ai-agent-controls-in-days',
      'ai-agent-audit-trails-for-dispute-resolution',
      'dual-approval-for-high-risk-actions',
      'fintech-ai-agent-approval-platform-requirements',
      'healthcare-ai-agent-compliance-software-buy',
    ],
  },
  {
    id: 'robotics-embodied',
    title: 'Robotics & embodied AI',
    description:
      'Policy gates for humanoids, ROS2, smart home, delivery robots, and physical-world prompt injection defenses.',
    anchorSlug: 'embodied-ai-robotics-policy-gate',
    matchTags: ['robotics', 'embodied-ai', 'ros2', 'humanoids', 'smart-home', 'iot', 'delivery-robots', 'fleet'],
    slugs: [
      'embodied-ai-robotics-policy-gate',
      'humanoid-robot-physical-action-gate',
      'ros2-safety-policy-runtime',
      'smart-home-ai-unlock-door-policy',
      'physical-world-prompt-injection-robots',
      'embodied-ai-safety-near-humans',
      'fleet-kill-switch-autonomous-systems',
      'healthcare-robotics-phi-policy-packs',
    ],
  },
  {
    id: 'developer-agents',
    title: 'Developer & coding agents',
    description:
      'Security for Cursor, Claude Code, Copilot Workspace, Replit, and autonomous engineers — gate deploy, shell, and secrets.',
    anchorSlug: 'cursor-ai-agent-production-guardrails',
    matchTags: ['developer', 'cursor', 'windsurf', 'github', 'replit', 'lovable', 'bolt', 'v0', 'codex', 'tabnine', 'openai', 'anthropic', 'chatgpt', 'claude', 'browser', 'xai', 'grok', 'bedrock', 'aws', 'perplexity'],
    slugs: [
      'cursor-ai-agent-production-guardrails',
      'claude-code-cli-tool-verification',
      'github-copilot-workspace-agent-controls',
      'windsurf-cascade-agent-tool-security',
      'devin-autonomous-engineer-spend-and-deploy-gates',
      'replit-agent-database-write-protection',
      'openai-codex-agent-side-effect-controls',
      'bolt-new-v0-agent-deployment-gates',
    ],
  },
  {
    id: 'microsoft-ecosystem',
    title: 'Microsoft & Copilot agents',
    description:
      'Execution controls for Copilot Studio, Power Automate, Azure AI Foundry, Agent 365, Fabric, and Windows Copilot.',
    anchorSlug: 'microsoft-agent-365-alternative-execution-control',
    matchTags: ['microsoft', 'copilot', 'power-automate', 'azure', 'entra', 'fabric', 'agent-365', 'semantic-kernel', 'bing'],
    slugs: [
      'microsoft-agent-365-alternative-execution-control',
      'microsoft-copilot-studio-action-approval-patterns',
      'power-automate-ai-flow-governance',
      'azure-ai-foundry-agent-security-baseline',
      'semantic-kernel-tool-calling-verification',
      'microsoft-entra-agent-identity-gaps',
      'bing-copilot-enterprise-agent-execution-controls',
    ],
  },
  {
    id: 'google-cloud',
    title: 'Google Cloud & Gemini agents',
    description:
      'Agent Gateway, Vertex MCP, Model Armor gaps, Gemini tool-use, A2A protocol, and IAM deny policy patterns.',
    anchorSlug: 'google-agent-gateway-mcp-security-2026',
    matchTags: ['google-cloud', 'gemini', 'vertex', 'a2a', 'google-search'],
    slugs: [
      'google-agent-gateway-mcp-security-2026',
      'gemini-enterprise-agent-tool-use-controls',
      'google-a2a-agent-protocol-security-baseline',
      'vertex-managed-mcp-servers-production-hardening',
      'google-model-armor-vs-runtime-execution-gates',
      'vertex-ai-agent-security-controls-after-double-agent-news',
    ],
  },
  {
    id: 'enterprise-platforms',
    title: 'Enterprise platform agents',
    description:
      'CRM, ERP, ITSM, and data platform agents — Salesforce Agentforce, ServiceNow, SAP, Workday, HubSpot, Databricks.',
    anchorSlug: 'salesforce-agentforce-execution-verification',
    matchTags: ['salesforce', 'servicenow', 'sap', 'workday', 'hubspot', 'databricks', 'crm', 'itsm', 'erp'],
    slugs: [
      'salesforce-agentforce-execution-verification',
      'servicenow-now-assist-agent-governance',
      'sap-joule-agent-financial-controls',
      'workday-ai-agent-hr-action-approval',
      'hubspot-ai-agent-crm-write-controls',
      'databricks-agent-brick-warehouse-gates',
    ],
  },
  {
    id: 'social-automation',
    title: 'Social & messaging agents',
    description:
      'Gate LinkedIn, X, Meta, Discord, Slack, WhatsApp, and TikTok automation before posts, DMs, and ad spend.',
    anchorSlug: 'slack-ai-agent-workflow-approval',
    matchTags: ['social', 'linkedin', 'twitter', 'discord', 'slack', 'instagram', 'facebook', 'meta', 'whatsapp', 'tiktok', 'youtube', 'reddit', 'threads', 'bluesky'],
    slugs: [
      'slack-ai-agent-workflow-approval',
      'linkedin-automation-ai-agent-approval',
      'twitter-x-ai-bot-post-approval-gates',
      'discord-bot-ai-admin-action-verification',
      'whatsapp-business-ai-message-approval',
      'facebook-messenger-ai-agent-policy',
    ],
  },
  {
    id: 'workflow-automation',
    title: 'Workflow & automation agents',
    description:
      'n8n, Zapier, Make, CrewAI, LangGraph, and enterprise workflow bots — verify before CRM, Slack, and script side effects.',
    anchorSlug: 'workflow-automation-ai-governance',
    matchTags: ['workflow', 'automation', 'n8n', 'zapier', 'make', 'crewai', 'langchain', 'langgraph', 'autogen', 'llamaindex', 'haystack', 'rag'],
    slugs: [
      'workflow-automation-ai-governance',
      'n8n-ai-workflow-security-gate-setup',
      'zapier-ai-actions-approval-workflow',
      'make-com-scenario-agent-gates',
      'crewai-production-security-setup-guide',
      'langgraph-multi-agent-approval-patterns',
    ],
  },
  {
    id: 'multi-agent',
    title: 'Multi-agent systems',
    description:
      'Trust boundaries for agent-to-agent protocols, supervisor graphs, group chat agents, and cross-vendor handoffs.',
    anchorSlug: 'agent2agent-protocol-trust-boundaries',
    matchTags: ['multi-agent', 'a2a', 'swarm', 'autogen'],
    slugs: [
      'agent2agent-protocol-trust-boundaries',
      'autogen-group-chat-agent-gates',
      'openai-swarm-multi-agent-runtime-trust',
      'langgraph-multi-agent-approval-patterns',
    ],
  },
  {
    id: 'incident-response',
    title: 'Incident response & kill switches',
    description:
      'Fleet pause, kill switch design, incident runbooks, and containment after agent compromise or headline breaches.',
    anchorSlug: 'ai-agent-kill-switch-best-practices',
    matchTags: ['incident-response', 'kill-switch', 'fleet', 'operations', 'ciso', 'news'],
    slugs: [
      'ai-agent-kill-switch-best-practices',
      'ai-agent-incident-response-runbook',
      'deploy-ai-agent-kill-switch-in-30-minutes',
      'what-happens-when-ai-agent-is-hacked',
      'ai-agent-security-after-headline-incidents-2026',
      'ciso-checklist-agent-execution-gates-2026',
    ],
  },
  {
    id: 'get-started',
    title: 'Get started & buyer guides',
    description:
      'Comparisons, pricing, free start guides, and week-one pilots — deploy runtime controls before your next launch.',
    anchorSlug: 'sanctum-runtime-free-trial-get-started',
    matchTags: ['transactional', 'get-started', 'comparison', 'pricing', 'founder', 'startup', 'indie-hacker', 'pilot', 'buyers-guide', 'paa', 'yahoo', 'seo', 'onboarding', 'product-hunt'],
    slugs: [
      'sanctum-runtime-free-trial-get-started',
      'best-ai-agent-security-software-2026',
      'ai-agent-security-pilot-week-one-playbook',
      'how-much-does-ai-agent-governance-cost',
      'ai-agent-safety-pilot-for-startups',
      'founder-guide-runtime-trust-before-launch',
    ],
  },
]

const slugToHub = new Map<string, BlogHub>()
for (const hub of BLOG_HUBS) {
  for (const slug of hub.slugs) {
    if (!slugToHub.has(slug)) slugToHub.set(slug, hub)
  }
}

function hubFromTags(post: BlogPostMeta): BlogHub | undefined {
  for (const hub of BLOG_HUBS) {
    if (!hub.matchTags?.length) continue
    if (post.tags.some((tag) => hub.matchTags!.includes(tag))) {
      return hub
    }
  }
  if (post.tags.includes('ai-agents') || post.tags.includes('security')) {
    return BLOG_HUBS.find((h) => h.id === 'agentic-risk')
  }
  return undefined
}

export function getHubForSlug(slug: string): BlogHub {
  if (slugToHub.has(slug)) return slugToHub.get(slug)!
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) return BLOG_HUBS.find((h) => h.id === 'agentic-risk')!
  const hub = hubFromTags(post) ?? BLOG_HUBS.find((h) => h.id === 'agentic-risk')!
  slugToHub.set(slug, hub)
  return hub
}

/** All posts belonging to a hub — explicit slugs plus tag-matched posts. */
export function getPostsForHub(hub: BlogHub): BlogPostMeta[] {
  const explicit = new Set(hub.slugs)
  return BLOG_POSTS.filter(
    (p) => explicit.has(p.slug) || getHubForSlug(p.slug)?.id === hub.id,
  )
}

export function getHubPosts(hub: BlogHub): string[] {
  return getPostsForHub(hub).map((p) => p.slug)
}
