import type { BlogPostMeta } from './blog-posts'
import { blogPostPath } from './blog-posts'
import { articleJsonLd, pageSeo } from './seo'

/** CTR-optimized SERP titles and descriptions — keyed by slug. */
export const BLOG_SEO_OVERRIDES: Record<string, { title: string; description: string }> = {
  // Page-1 candidates (position < 15 in GSC)
  'how-to-validate-tool-arguments-in-mcp': {
    title: 'How to Validate MCP Tool Arguments (2026 Security Guide)',
    description:
      '7-step checklist: schema validation, path allowlists, range checks, and pre-execution gates. Stop confused-deputy and injection paths before MCP tools run.',
  },
  'what-is-confused-deputy-in-ai-agents': {
    title: 'Confused Deputy in AI Agents: What It Is & How to Stop It',
    description:
      'Untrusted intent can hijack trusted credentials in MCP and agent systems. Learn runtime authorization patterns that break the attack path.',
  },
  'how-to-stop-ai-agents-from-sending-emails-without-approval': {
    title: 'Stop AI Agents Sending Emails Without Approval (2026)',
    description:
      'Prompt rules fail. Route send_email through runtime policy gates, human verification, and SLA escalation — with audit trails operators can defend.',
  },
  'mobile-pwa-runtime-verification': {
    title: 'Mobile AI Agent Approval App: PWA Setup in 10 Minutes',
    description:
      'Installable PWA + push alerts for human-in-the-loop verification. Approve, block, or escalate high-risk agent actions from phone or desktop.',
  },
  'degraded-mode-policies-during-infrastructure-outages': {
    title: 'Degraded-Mode AI Agent Policies During Outages (Fail-Safe)',
    description:
      'Define what autonomous agents can do when models or providers fail. Fail closed on side effects — not open — with explicit outage policy tiers.',
  },
  'soc2-nist-ai-rmf-runtime-evidence': {
    title: 'SOC 2 & NIST AI RMF: Runtime Evidence from Action Gates',
    description:
      'Map GOVERN, MAP, MEASURE, and MANAGE to signed tokens, audit logs, and policy replay. Exportable evidence for compliance reviews.',
  },
  'can-openai-claude-gemini-share-one-agent-control-plane': {
    title: 'One AI Agent Control Plane for OpenAI, Claude & Gemini',
    description:
      'Yes — normalize action events and enforce policy at execution time instead of coupling controls to one model provider. Cross-vendor patterns inside.',
  },
  'indirect-prompt-injection-source-trust': {
    title: 'Indirect Prompt Injection Defense: Source-Trust for Agents',
    description:
      'Treat tool output as untrusted. Source-trust levels let policies score tool_output and untrusted_content as higher risk — automatically.',
  },
  'ai-agent-kill-switch-best-practices': {
    title: 'AI Agent Kill Switch Best Practices (Incident Response 2026)',
    description:
      'Design a fast, auditable fleet kill switch. Stop state-changing actions across agents in one operator action — with clear resume procedures.',
  },
  'fleet-kill-switch-autonomous-systems': {
    title: 'Fleet Kill Switch for Autonomous Agents & Robots',
    description:
      'Org-wide pause returns BLOCKED on every verify until you resume. One operator action stops agents, robots, and workflows immediately.',
  },
  'sanctum-vs-guardrails': {
    title: 'Sanctum vs Guardrails: Chat Safety vs Execution Control',
    description:
      'Guardrails filter what models say. Runtime trust protects what they do. When to use both — and why autonomous systems need an action boundary.',
  },
  'ros2-safety-policy-runtime': {
    title: 'ROS2 Safety Policy Runtime: Gate Robot Commands First',
    description:
      'Intercept navigation, manipulation, and e-stop with policies before the stack runs. Verify hazardous moves; always approve emergency stop.',
  },
  'signed-action-tokens-executor-verification': {
    title: 'Signed Action Tokens: HMAC Proof Before Side Effects Run',
    description:
      'Approval in console is not enough. Executors verify short-lived HMAC tokens scoped to actor, action, and audit ID before any real-world effect.',
  },
  'mcp-server-action-gate': {
    title: 'MCP Server Action Gate: Verify Tools Before Execution',
    description:
      'Gate every MCP tool call — approve, verify, or block before the server executes filesystem, API, and device side effects.',
  },
  'langchain-agent-middleware-verification': {
    title: 'LangChain Agent Middleware: Verify Tools Before Execution',
    description:
      'Wrap LangChain tool calls with verifyAction() or protectAgent(). Policies, human approval, and audit — without rewriting your agent graph.',
  },

  // Volume leaders (high impressions, pages 3–8)
  'what-is-agentic-ai-risk-management': {
    title: 'Agentic AI Risk Management: Framework for Production Teams',
    description:
      'Govern autonomous AI across planning, verification, approval, execution, and audit. Action-centric risk management — not prompt safety alone.',
  },
  'mcp-server-security-checklist-2026': {
    title: 'MCP Server Security Best Practices & Checklist (2026)',
    description:
      'Lock down MCP servers first: tool poisoning, argument validation, least privilege, dispatcher hardening, and pre-execution policy gates.',
  },
  'how-to-prevent-ai-agent-data-exfiltration': {
    title: 'Prevent AI Agent Data Exfiltration: 7 Controls That Work',
    description:
      'Stop exfiltration chains with least-privilege tools, source-trust classification, export gates, and human verification for outbound transfers.',
  },
  'runtime-authorization-vs-guardrails-explained': {
    title: 'What Is Runtime Authorization? (vs Guardrails, Explained)',
    description:
      'Runtime authorization controls side effects before they execute. Guardrails filter language. Learn why production teams need both layers.',
  },
  'best-practices-for-ai-agent-tool-calling': {
    title: 'AI Agent Tool Calling Best Practices for Production (2026)',
    description:
      'Standardize tool wrappers, validate arguments, bind approvals to signed tokens, and log execution receipts — patterns that scale.',
  },

  // Additional high-impression posts
  'ai-agent-action-approval-before-execution': {
    title: 'AI Agent Action Approval: Gate Side Effects Before Execution',
    description:
      'Approve, verify, or block tool calls, API writes, and file ops with verifyAction(). Patterns for LangChain, MCP, and custom agents.',
  },
  'runtime-trust-layer-for-ai-agents': {
    title: 'AI Trust Layer for Agents: Runtime Verification Explained',
    description:
      'A runtime trust layer gates every side effect — APPROVE, REQUIRE_VERIFICATION, or BLOCKED — before APIs, devices, and robots execute.',
  },
  'ai-agent-rbac-for-tool-permissions': {
    title: 'RBAC for AI Agents: Tool Permissions at Execution Time',
    description:
      'Enforce role-based permissions where it matters: at tool execution with actor, org, and scope context in every action check.',
  },
  'agentic-commerce-fraud-prevention': {
    title: 'Agentic Commerce Fraud Prevention: What Actually Works',
    description:
      'Identity proof, authorization rails, policy gates, and dispute-ready logs for autonomous shopping — including Salesforce Commerce patterns.',
  },
  'shadow-ai-agents-and-unauthorized-purchases': {
    title: 'Shadow AI Agents: Detection & Containment Guide',
    description:
      'Find unapproved autonomous spending paths fast. Policy controls, kill switches, and audit trails to contain shadow agents before damage spreads.',
  },
  'how-to-audit-ai-agent-decisions': {
    title: 'How to Audit AI Agent Decisions (Compliance-Ready Trails)',
    description:
      'Replayable decision trails with policy versioning, correlation IDs, and execution receipts — evidence that survives incident review.',
  },
  'can-ai-agents-be-soc2-compliant': {
    title: 'Can AI Agents Be SOC 2 Compliant? (Practical Answer)',
    description:
      'Map runtime controls, approval logs, policy versions, and exportable evidence to SOC 2 expectations for autonomous systems.',
  },
  'how-to-approve-ai-agent-actions-on-mobile': {
    title: 'Approve AI Agent Actions on Mobile (PWA + Push Alerts)',
    description:
      'Operators review and resolve high-risk actions from phone or desktop. Installable PWA with full auditability — setup in minutes.',
  },
  'what-is-human-in-the-loop-for-ai-agents': {
    title: 'Human-in-the-Loop for AI Agents: Real Enforcement Edition',
    description:
      'HITL is an execution pause outside the model — approve, block, and escalate paths. Not a prompt suggestion teams can ignore.',
  },
  'ai-agent-security-checklist-for-production': {
    title: 'AI Agent Security Checklist for Production (2026)',
    description:
      'Execution gates, approvals, least privilege, replay, kill switch, and incident drills — a practical baseline before you ship agents.',
  },
  'ai-agent-approval-platform-comparison-2026': {
    title: 'Best AI Agent Approval Platform Comparison (2026)',
    description:
      'Compare approval UX, policy depth, audit exports, fleet pause, and pricing. What to buy when you need human checkpoints this quarter.',
  },
  'best-human-in-the-loop-approval-software-2026': {
    title: 'Best Human-in-the-Loop Approval Software for AI (2026)',
    description:
      'Side-by-side view of HITL platforms: mobile approval, SLA escalation, policy-as-code, and runtime enforcement depth.',
  },
  'best-ai-agent-security-software-2026': {
    title: 'Best AI Agent Security Software (2026 Buyer\'s Guide)',
    description:
      'Compare execution gates, MCP security, identity, and governance platforms — and what to deploy first for controls this quarter.',
  },
  'shadow-ai-agent-detection-software-comparison': {
    title: 'Shadow AI Agent Detection Software: Compare Then Contain',
    description:
      'Discovery tools find rogue agents — runtime gates stop them. How to buy both without duplicate spend.',
  },
  'enterprise-ai-agent-control-plane-shortlist-2026': {
    title: 'Enterprise AI Agent Control Plane Shortlist (2026)',
    description:
      'Consolidate OpenAI, Gemini, and workflow sprawl with one execution-time governance layer. Evaluation criteria for platform teams.',
  },
  'microsoft-agent-365-alternative-execution-control': {
    title: 'Microsoft Agent 365 Alternative: Execution-Time Control',
    description:
      'When you need approve/block before side effects — not just observability. Cross-vendor runtime gates alongside Microsoft agent stacks.',
  },
  'yahoo-search-ai-agent-approval-answers': {
    title: 'AI Agent Approval Software: Direct Answers (2026)',
    description:
      'Best platforms with built-in human approval checkpoints, mobile verify, audit exports, and runtime enforcement — concise buyer answers.',
  },
  'how-to-design-ai-agent-policies-that-scale': {
    title: 'Design AI Agent Policies That Scale (Risk Tiers + Replay)',
    description:
      'Action taxonomy, risk tiers, versioning, and replay-based improvement — policy systems that stay usable as teams grow.',
  },
  'ai-agent-approval-sla-and-escalation-design': {
    title: 'AI Agent Approval SLA & Escalation Design (No Auto-Approve)',
    description:
      'SLA tiers, backup approvers, timeout policy, and mobile response patterns — approval queues that do not stall operations.',
  },
  'physical-world-prompt-injection-robots': {
    title: 'Physical-World Prompt Injection in Robots: Defenses',
    description:
      'Misleading environmental text can hijack embodied AI. Action controls must not trust model perception alone — gate before motors run.',
  },
  'chatgpt-gpt-actions-enterprise-security': {
    title: 'ChatGPT GPT Actions Enterprise Security Controls',
    description:
      'Gate GPT Actions and custom connectors with runtime authorization, human approval, and audit before enterprise side effects execute.',
  },
  'claude-code-cli-tool-verification': {
    title: 'Claude Code CLI Tool Verification & Side-Effect Controls',
    description:
      'Verify CLI tool calls before filesystem, shell, and network side effects. Patterns for coding agents in production environments.',
  },
  'vertex-ai-agent-security-controls-after-double-agent-news': {
    title: 'Vertex AI Agent Security Controls (2026 Best Practices)',
    description:
      'Agent compliance, tool-use gates, and identity boundaries for Vertex AI agents — execution-time controls beyond platform defaults.',
  },
  'n8n-ai-workflow-security-gate-setup': {
    title: 'n8n AI Workflow Security Gate Setup (Step-by-Step)',
    description:
      'Add pre-execution verification to n8n AI workflows. Gate Slack, CRM, and script steps without slowing low-risk automation.',
  },
  'power-automate-ai-flow-governance': {
    title: 'Power Automate AI Flow Governance & Runtime Gates',
    description:
      'Govern Copilot and AI flows with execution-time policy, approval queues, and audit exports for Microsoft-centric enterprises.',
  },
  'fintech-ai-agent-approval-platform-requirements': {
    title: 'Fintech AI Agent Approval Platform Requirements (RFP Guide)',
    description:
      'Dual approval, audit exports, spending limits, and SOC 2 evidence — what fintech teams should require from agent governance vendors.',
  },
}

export function getBlogPostSeo(
  slug: string,
  fallback: Pick<BlogPostMeta, 'title' | 'description'>,
): { title: string; description: string; displayTitle: string } {
  const override = BLOG_SEO_OVERRIDES[slug]
  if (!override) {
    return {
      title: `${fallback.title} — Sanctum`,
      description: fallback.description,
      displayTitle: fallback.title,
    }
  }
  const title = override.title.includes('— Sanctum')
    ? override.title
    : `${override.title} — Sanctum`
  return {
    title,
    description: override.description,
    displayTitle: override.title,
  }
}

/** Shared head() for blog posts — static routes and dynamic slug route. */
export function blogPostHead(slug: string, post: BlogPostMeta, extraScripts: object[] = []) {
  const seo = getBlogPostSeo(slug, post)
  const base = pageSeo({
    title: seo.title,
    description: seo.description,
    path: blogPostPath(slug),
    ogType: 'article',
  })
  return {
    ...base,
    meta: [...base.meta, { name: 'keywords', content: post.tags.join(', ') }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(
          articleJsonLd({
            ...post,
            title: seo.displayTitle,
            description: seo.description,
            tags: post.tags,
          }),
        ),
      },
      ...extraScripts,
    ],
  }
}
