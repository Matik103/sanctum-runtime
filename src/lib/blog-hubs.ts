/** Pillar hubs — cluster related posts for internal linking and blog index navigation. */

export type BlogHub = {
  id: string
  title: string
  description: string
  /** Primary slug for hub landing (usually highest-impression post in cluster). */
  anchorSlug: string
  slugs: string[]
}

export const BLOG_HUBS: BlogHub[] = [
  {
    id: 'agentic-risk',
    title: 'Agentic AI risk management',
    description:
      'Frameworks, policies, and runtime controls for governing autonomous AI decisions — from risk tiers to audit evidence.',
    anchorSlug: 'what-is-agentic-ai-risk-management',
    slugs: [
      'what-is-agentic-ai-risk-management',
      'how-to-design-ai-agent-policies-that-scale',
      'ai-agent-security-checklist-for-production',
      'what-is-ai-agent-observability-vs-control',
      'shadow-ai-agents-and-unauthorized-purchases',
      'ai-agent-governance-for-finance-teams',
      'from-observability-to-runtime-enforcement',
    ],
  },
  {
    id: 'mcp-security',
    title: 'MCP security',
    description:
      'Harden Model Context Protocol servers: argument validation, confused-deputy defense, checklists, and pre-execution gates.',
    anchorSlug: 'mcp-server-security-checklist-2026',
    slugs: [
      'mcp-server-security-checklist-2026',
      'how-to-validate-tool-arguments-in-mcp',
      'what-is-confused-deputy-in-ai-agents',
      'mcp-server-action-gate',
      'indirect-prompt-injection-source-trust',
      'google-agent-gateway-mcp-security-2026',
      'mcp-payment-tools-security',
    ],
  },
  {
    id: 'runtime-authorization',
    title: 'Runtime authorization',
    description:
      'Execution-time trust layers, guardrails vs authorization, signed tokens, and cross-provider control planes.',
    anchorSlug: 'runtime-authorization-vs-guardrails-explained',
    slugs: [
      'runtime-authorization-vs-guardrails-explained',
      'runtime-trust-layer-for-ai-agents',
      'sanctum-vs-guardrails',
      'signed-action-tokens-executor-verification',
      'can-openai-claude-gemini-share-one-agent-control-plane',
      'best-practices-for-ai-agent-tool-calling',
      'langchain-agent-middleware-verification',
    ],
  },
  {
    id: 'agentic-commerce',
    title: 'Agentic commerce & fraud',
    description:
      'Fraud prevention, chargebacks, wallet segmentation, and shadow-agent containment for autonomous purchasing.',
    anchorSlug: 'agentic-commerce-fraud-prevention',
    slugs: [
      'agentic-commerce-fraud-prevention',
      'chargebacks-and-ai-agent-transactions',
      'shadow-ai-agents-and-unauthorized-purchases',
      'ai-agent-spending-limits-and-wallet-segmentation',
      'ai-agent-credit-card-safety-checklist',
      'red-teaming-agentic-commerce-scenarios',
      'secure-agent-wallet-architecture',
    ],
  },
  {
    id: 'hitl-approvals',
    title: 'Human-in-the-loop approvals',
    description:
      'Approval workflows, mobile verification, SLA design, and platform comparisons for production agent teams.',
    anchorSlug: 'ai-agent-action-approval-before-execution',
    slugs: [
      'ai-agent-action-approval-before-execution',
      'what-is-human-in-the-loop-for-ai-agents',
      'how-to-approve-ai-agent-actions-on-mobile',
      'ai-agent-approval-sla-and-escalation-design',
      'how-to-stop-ai-agents-from-sending-emails-without-approval',
      'best-human-in-the-loop-approval-software-2026',
      'ai-agent-approval-platform-comparison-2026',
    ],
  },
  {
    id: 'soc2-compliance',
    title: 'SOC 2 & compliance evidence',
    description:
      'SOC 2 readiness, NIST AI RMF mapping, audit trails, and exportable runtime evidence for autonomous systems.',
    anchorSlug: 'can-ai-agents-be-soc2-compliant',
    slugs: [
      'can-ai-agents-be-soc2-compliant',
      'soc2-nist-ai-rmf-runtime-evidence',
      'how-to-audit-ai-agent-decisions',
      'get-soc2-ready-ai-agent-controls-in-days',
      'ai-agent-audit-trails-for-dispute-resolution',
      'dual-approval-for-high-risk-actions',
      'fintech-ai-agent-approval-platform-requirements',
    ],
  },
]

const slugToHub = new Map<string, BlogHub>()
for (const hub of BLOG_HUBS) {
  for (const slug of hub.slugs) {
    if (!slugToHub.has(slug)) slugToHub.set(slug, hub)
  }
}

export function getHubForSlug(slug: string): BlogHub | undefined {
  return slugToHub.get(slug)
}

export function getHubPosts(hub: BlogHub): string[] {
  return hub.slugs
}
