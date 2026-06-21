/** Deep content sections for high-impression posts — merged into BLOG_ANSWER_POSTS at render time. */

import { BLOG_ANSWER_POSTS } from './blog-answers'
import { getBlogAnswerPost, getBlogPost } from './blog-posts'

export type BlogExpandedSection = {
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export const BLOG_EXPANDED_SECTIONS: Record<string, BlogExpandedSection[]> = {
  'what-is-agentic-ai-risk-management': [
    {
      heading: 'What is agentic AI risk management?',
      paragraphs: [
        'Agentic AI risk management is the practice of governing autonomous systems across the full action lifecycle — not just model outputs. It covers how agents plan, request tools, get verified, receive human approval, execute side effects, and leave audit evidence.',
        'Unlike traditional LLM safety (moderation, red-teaming, evals), agentic risk management is action-centric: the unit of control is verifyAction({ actor, action, context }), not "was the chat response toxic?"',
      ],
      bullets: [
        'Map every side-effecting capability to an action class and risk tier.',
        'Enforce APPROVE / REQUIRE_VERIFICATION / BLOCKED before execution.',
        'Record policy version, decision reason, and operator resolution in audit.',
        'Replay historical decisions when policies change.',
      ],
    },
    {
      heading: 'Agentic AI risk assessment framework (5 layers)',
      paragraphs: [
        'Teams searching for an "agentic AI risk assessment framework" usually need a repeatable model — not another spreadsheet. Use five layers:',
      ],
      bullets: [
        'Identity & scope — who is the actor, which org, which environment?',
        'Source trust — is intent from user, tool_output, or untrusted_content?',
        'Policy — what should happen for this action class at this risk tier?',
        'Verification — human or automated hold before irreversible effects.',
        'Evidence — signed tokens, audit IDs, and exportable compliance trails.',
      ],
    },
    {
      heading: 'Agentic AI risk management system: what to deploy first',
      paragraphs: [
        'Start with one verification API on your highest-blast-radius actions: payments, email send, file delete, database write, door unlock, robot move. Expand coverage as you observe blocked and held events.',
        'Sanctum Runtime provides the open-core execution gate; the hosted console adds approval queues, fleet pause, and audit export for operators.',
      ],
    },
  ],
  'mcp-server-security-checklist-2026': [
    {
      heading: 'MCP server security best practices (2026)',
      paragraphs: [
        'MCP expands what LLMs can touch — filesystems, APIs, payment rails, devices. Security must live at the server boundary and the execution gate, not in prompt instructions.',
      ],
      bullets: [
        'Validate every tool argument with strict schemas (types, ranges, enums).',
        'Run MCP server processes with least-privilege OS and network access.',
        'Review tool manifests for poisoning — hidden instructions in descriptions.',
        'Gate write, delete, exec, and export tools with runtime authorization.',
        'Log actor, tool name, arguments hash, and policy decision per call.',
        'Rate-limit high-risk tools and alert on unusual cross-tool chains.',
        'Harden dispatchers and RPC bridges — a common confused-deputy path.',
      ],
    },
    {
      heading: 'Dispatcher security checklist',
      paragraphs: [
        'Dispatcher layers that route tool calls between agents and backends are a frequent blind spot. Treat dispatchers like public APIs:',
      ],
      bullets: [
        'Authenticate every inbound tool request — no implicit trust from localhost.',
        'Scope credentials per agent identity, not shared service accounts.',
        'Reject tool calls whose arguments fail schema validation.',
        'Require runtime verification for state-changing dispatcher actions.',
      ],
    },
  ],
  'how-to-prevent-ai-agent-data-exfiltration': [
    {
      heading: 'How AI agent data exfiltration actually happens',
      paragraphs: [
        'Exfiltration rarely looks like "send all files to attacker.com" in one step. Attackers chain benign tools: read_file → summarize → send_email, or query_db → webhook_post. Prompt filters miss these because each step looks reasonable.',
      ],
    },
    {
      heading: 'AI data exfiltration prevention controls',
      paragraphs: [
        'Layer deterministic controls that do not depend on model judgment:',
      ],
      bullets: [
        'Least-privilege tool scopes per actor and environment.',
        'Source-trust classification — elevate risk for tool_output and untrusted_content.',
        'Block or verify export actions: email, webhook, S3 upload, external API write.',
        'Detect reconnaissance: unusual read volume before outbound transfer.',
        'Signed execution tokens so approved scope cannot be replayed elsewhere.',
      ],
    },
  ],
  'runtime-authorization-vs-guardrails-explained': [
    {
      heading: 'What is runtime authorization?',
      paragraphs: [
        'Runtime authorization is a deterministic decision made immediately before a side effect executes: should this action run, wait for human verification, or block? It evaluates actor, action, context, source trust, and policy — outside the model.',
        'Search queries like "runtime authorization" and "run time authorization" refer to this execution gate, not IAM login flows or OAuth scopes alone.',
      ],
    },
    {
      heading: 'Runtime authorization vs guardrails',
      paragraphs: [
        'Guardrails operate on tokens in and out of the model. Runtime authorization operates on the action layer. A model can pass every content filter and still execute a catastrophic tool call — only runtime authorization stops that.',
      ],
      bullets: [
        'Guardrails: content safety, PII in chat, policy violations in text.',
        'Runtime authorization: tool calls, API writes, payments, physical actions.',
        'Best practice: both layers, with audit tying chat context to execution decisions.',
      ],
    },
  ],
  'best-practices-for-ai-agent-tool-calling': [
    {
      heading: 'AI agent tool calling best practices',
      paragraphs: [
        'Production teams treat tool calling as a controlled API surface — every side effect goes through the same verification path.',
      ],
      bullets: [
        'One wrapper per tool — never mix protected and unprotected execution paths.',
        'Include actor, org, source trust, and correlation ID in every verify call.',
        'Validate arguments in server code before policy evaluation.',
        'Bind approval to short-lived HMAC tokens scoped to audit ID.',
        'Log execution receipts — did the executor actually run, and with what outcome?',
      ],
    },
    {
      heading: 'Tool permissions for agents at scale',
      paragraphs: [
        'RBAC at the UI is insufficient. Enforce permissions at verifyAction time with role metadata. Deny by default when context is missing.',
      ],
    },
  ],
  'how-to-validate-tool-arguments-in-mcp': [
    {
      heading: 'How to validate MCP tool arguments',
      paragraphs: [
        'Model-generated parameters are untrusted input — same as a public web form. Validation runs in deterministic server code before policy and before execution.',
      ],
      bullets: [
        'Use strict schema mode — reject unknown keys.',
        'Normalize and allowlist file paths; block .. traversal.',
        'Enforce numeric ranges and string length limits.',
        'Return structured errors operators can triage in approval queues.',
        'Run validation before verifyAction so policy sees clean context.',
      ],
    },
  ],
  'what-is-confused-deputy-in-ai-agents': [
    {
      heading: 'Confused deputy in MCP and agent systems',
      paragraphs: [
        'A confused deputy attack uses a privileged agent or tool to perform actions the user did not intend — often via indirect prompt injection in tool output or web content. The agent "deputizes" trusted credentials for untrusted intent.',
      ],
      bullets: [
        'Separate user intent from model-suggested tool calls with source-trust scoring.',
        'Require verification when source trust is tool_output or untrusted_content.',
        'Scope OAuth and API tokens per agent identity — no shared super-credentials.',
      ],
    },
  ],
  'agentic-commerce-fraud-prevention': [
    {
      heading: 'Agentic commerce fraud prevention',
      paragraphs: [
        'Autonomous purchasing introduces new fraud paths: prompt-injected checkout, shadow agents with stored cards, and dispute flows without human-readable evidence. Effective prevention combines identity, authorization, and pre-execution gates.',
      ],
      bullets: [
        'Segment agent wallets from primary accounts with hard spending caps.',
        'Require verification above amount and velocity thresholds.',
        'Log signed purchase intent with approval and policy version.',
        'Design chargeback evidence before disputes — not after.',
        'Apply Salesforce Commerce and payment-rail controls at the action layer.',
      ],
    },
  ],
  'can-ai-agents-be-soc2-compliant': [
    {
      heading: 'Can AI agents be SOC 2 compliant?',
      paragraphs: [
        'Yes — if you treat autonomous actions as in-scope systems with measurable controls, not as experimental chat features. Auditors look for evidence that high-risk actions were governed, not just logged after the fact.',
      ],
      bullets: [
        'Map CC6/CC7 controls to runtime authorization and approval workflows.',
        'Version policies and export decision logs with correlation IDs.',
        'Demonstrate kill switch and incident response drills.',
        'Show human-in-the-loop resolution for held actions.',
      ],
    },
  ],
  'how-to-audit-ai-agent-decisions': [
    {
      heading: 'How to audit AI agent activity',
      paragraphs: [
        'Useful audit trails connect intent, policy version, decision, operator action, and execution outcome. Search queries like "agent audit trails" and "how to audit ai agent activity" need this end-to-end chain.',
      ],
      bullets: [
        'Log every verifyAction attempt — not only successes.',
        'Store policy version ID with each decision.',
        'Bind execution receipts to audit IDs via signed tokens.',
        'Export CSV/JSON for compliance and dispute review.',
      ],
    },
  ],
  'ai-agent-action-approval-before-execution': [
    {
      heading: 'AI agent approval workflow that enforces before execution',
      paragraphs: [
        'Approval workflows must pause execution outside the model. When verifyAction returns REQUIRE_VERIFICATION, the tool must not run until an operator approves, blocks, or escalation fires.',
      ],
    },
  ],
  'how-to-stop-ai-agents-from-sending-emails-without-approval': [
    {
      heading: 'Block unauthorized agent email sends',
      paragraphs: [
        'Tag send_email and messaging tools as state-changing actions. Default to REQUIRE_VERIFICATION for external recipients and bulk sends. Timeout should escalate or block — never auto-approve high-risk email.',
      ],
    },
  ],
  'shadow-ai-agents-and-unauthorized-purchases': [
    {
      heading: 'Shadow AI agents: detection and containment',
      paragraphs: [
        'Shadow agents appear when teams deploy automation outside governance — personal API keys, unsanctioned workflow bots, experimental shopping agents. Detection plus runtime containment limits financial exposure.',
      ],
      bullets: [
        'Inventory agent identities and tool credentials centrally.',
        'Alert on new outbound payment or email tools without policy coverage.',
        'Fleet kill switch to block state-changing actions during investigation.',
        'Route all sanctioned agents through one verifyAction control plane.',
      ],
    },
  ],
}

function sectionHeadingFromTitle(title: string): string {
  const cleaned = title.replace(/\s*\(20\d{2}\)\s*$/, '').replace(/\?$/, '').trim()
  if (/^what is /i.test(cleaned)) return cleaned
  if (/^how to /i.test(cleaned)) return cleaned
  return `${cleaned}: what teams should know`
}

function autoExpandedFromPost(slug: string): BlogExpandedSection[] {
  const post = getBlogPost(slug)
  if (!post) return []
  return [
    {
      heading: sectionHeadingFromTitle(post.title),
      paragraphs: [
        post.description,
        `Practical ${post.readTime}-minute guidance for teams using runtime authorization, policy gates, and audit trails with Sanctum Runtime.`,
      ],
    },
  ]
}

function autoExpandedSections(slug: string): BlogExpandedSection[] {
  const content = getBlogAnswerPost(slug)
  const post = getBlogPost(slug)
  if (!content || !post) return autoExpandedFromPost(slug)

  const sections: BlogExpandedSection[] = []

  if (content.answers[0]) {
    sections.push({
      heading: sectionHeadingFromTitle(post.title),
      paragraphs: [content.answers[0].answer],
    })
  }

  if (content.answers[1]) {
    sections.push({
      heading: content.answers[1].question,
      paragraphs: [content.answers[1].answer],
    })
  }

  return sections
}

export function getExpandedSections(slug: string): BlogExpandedSection[] {
  const manual = BLOG_EXPANDED_SECTIONS[slug]
  if (manual?.length) return manual
  return autoExpandedSections(slug)
}
