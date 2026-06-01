/**
 * Generates src/lib/blog-acquisition-posts.ts — 80 unique acquisition/SEO posts.
 * Run: node scripts/generate-blog-acquisition.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function collectExistingSlugs() {
  const lib = resolve(root, 'src/lib')
  const files = [
    'blog-posts.ts',
    'blog-trending-posts.ts',
    'blog-transactional-posts.ts',
  ]
  const slugs = new Set()
  for (const f of files) {
    const text = readFileSync(resolve(lib, f), 'utf8')
    for (const m of text.matchAll(/slug:\s*'([^']+)'/g)) slugs.add(m[1])
  }
  return slugs
}

/** [slug, title, description, tags[], readTime?, featured?] */
const POSTS = [
  // Google / Search / Cloud (10)
  ['google-agent-gateway-mcp-security-2026', 'Google Agent Gateway and MCP security in 2026', 'What Google Cloud Next announced for agent gateways, managed MCP, and where execution-time gates still belong in your stack.', ['google-cloud', 'mcp', 'news', 'acquisition'], 7, true],
  ['google-model-armor-vs-runtime-execution-gates', 'Google Model Armor vs runtime execution gates', 'Model Armor filters unsafe content — agents still need approve/block before emails, payments, and API writes run.', ['google-cloud', 'comparison', 'runtime-trust', 'acquisition'], 6],
  ['google-cloud-next-2026-agent-identity-lessons', 'Google Cloud Next 2026: agent identity lessons for builders', 'Agent Identity, IAM deny policies, and BYOSA — practical takeaways for teams shipping autonomous tools this quarter.', ['google-cloud', 'identity', 'news', 'acquisition'], 7],
  ['gemini-enterprise-agent-tool-use-controls', 'Gemini enterprise agents: tool-use controls that scale', 'How to gate Gemini function calling and Vertex agents without slowing product teams — console-first pattern.', ['gemini', 'google-cloud', 'tool-use', 'acquisition'], 6],
  ['google-a2a-agent-protocol-security-baseline', 'Google A2A agent protocol: security baseline for multi-agent systems', 'Agent-to-agent messaging needs trust boundaries — identity, scoped delegation, and execution verification.', ['a2a', 'multi-agent', 'security', 'acquisition'], 7],
  ['vertex-managed-mcp-servers-production-hardening', 'Vertex managed MCP servers: production hardening checklist', 'Schema validation, least privilege, and pre-execution policy for payment and file tools on managed MCP.', ['vertex', 'mcp', 'security', 'acquisition'], 7],
  ['google-iam-deny-policies-for-ai-service-agents', 'Google IAM deny policies for AI service agents', 'Deny policies reduce blast radius — pair cloud IAM with action-layer gates for defense in depth.', ['google-cloud', 'iam', 'security', 'acquisition'], 6],
  ['google-ai-overviews-and-agent-trust-for-teams', 'Google AI Overviews and agent trust: what product teams should build', 'Search UX is shifting — customers will expect the same transparency and controls from your autonomous features.', ['seo', 'google-search', 'trust', 'acquisition'], 5],
  ['people-also-ask-ai-agent-approval-software', 'People Also Ask: best AI agent approval software (answered for 2026)', 'Direct answers to PAA-style queries on approval platforms, pricing, and fastest path to production gates.', ['paa', 'seo', 'human-in-the-loop', 'acquisition'], 6, true],
  ['bing-copilot-enterprise-agent-execution-controls', 'Bing and Copilot enterprise: where execution controls fit', 'Microsoft discovery traffic often lands on Copilot governance — this is what to add for real approve/block.', ['bing', 'microsoft', 'copilot', 'acquisition'], 6],

  // Microsoft (8)
  ['microsoft-copilot-studio-action-approval-patterns', 'Microsoft Copilot Studio: action approval patterns', 'Power Platform agents can trigger real side effects — route high-impact actions through runtime verification.', ['copilot', 'microsoft', 'power-platform', 'acquisition'], 6],
  ['azure-ai-foundry-agent-security-baseline', 'Azure AI Foundry agent security baseline', 'Foundry deployments need tool governance, secrets hygiene, and execution gates before production traffic.', ['azure', 'microsoft', 'security', 'acquisition'], 7],
  ['semantic-kernel-tool-calling-verification', 'Semantic Kernel tool calling with verification', 'Wrap SK plugins and planners with verifyAction so policy stays consistent across .NET and Python agents.', ['semantic-kernel', 'microsoft', 'sdk', 'acquisition'], 6],
  ['power-automate-ai-flow-governance', 'Power Automate AI flows: governance without killing automation', 'Gate cloud flows that send email, update records, or spend budget — keep low-risk steps fast.', ['power-automate', 'microsoft', 'workflow', 'acquisition'], 6],
  ['microsoft-entra-agent-identity-gaps', 'Microsoft Entra and agent identity: gaps execution gates fill', 'Identity proves who the agent is — runtime trust decides whether this specific action should run now.', ['entra', 'microsoft', 'identity', 'acquisition'], 6],
  ['fabric-copilot-agents-data-plane-security', 'Microsoft Fabric Copilot agents: data-plane security', 'Warehouse and pipeline agents need row-level awareness plus pre-execution policy on exports and writes.', ['fabric', 'microsoft', 'data', 'acquisition'], 7],
  ['windows-copilot-actions-runtime-trust', 'Windows Copilot actions and runtime trust on endpoints', 'OS-level assistants can open apps and files — enterprise teams should gate destructive and exfiltration paths.', ['windows', 'copilot', 'endpoint', 'acquisition'], 6],
  ['microsoft-agent-365-plus-execution-gates', 'Microsoft Agent 365 plus execution gates: combined reference architecture', 'Inventory and governance from Agent 365 — add Sanctum-style verification where side effects happen.', ['agent-365', 'microsoft', 'architecture', 'acquisition'], 7],

  // AI coding / dev platforms (10)
  ['cursor-ai-agent-production-guardrails', 'Cursor AI agents: production guardrails before you ship', 'IDE agents can edit repos and run terminals — gate prod deploys, secrets access, and customer data paths.', ['cursor', 'developer', 'get-started', 'acquisition'], 6, true],
  ['windsurf-cascade-agent-tool-security', 'Windsurf Cascade agent tool security', 'Multi-file agents need one execution boundary — verify before git push, API calls, and cloud deploy hooks.', ['windsurf', 'developer', 'security', 'acquisition'], 5],
  ['github-copilot-workspace-agent-controls', 'GitHub Copilot Workspace agent controls', 'Workspace-style autonomy should not merge or deploy without policy — practical gating for eng leads.', ['github', 'copilot', 'developer', 'acquisition'], 6],
  ['devin-autonomous-engineer-spend-and-deploy-gates', 'Devin-style autonomous engineers: spend and deploy gates', 'Autonomous coding agents touch billing and production — wallet limits plus verify on deploy and spend.', ['devin', 'developer', 'payments', 'acquisition'], 7],
  ['replit-agent-database-write-protection', 'Replit Agent database write protection', 'Sandbox agents still reach real DBs in staging — gate INSERT/UPDATE/DELETE and schema migrations.', ['replit', 'developer', 'database', 'acquisition'], 5],
  ['lovable-ai-app-generator-production-safety', 'Lovable AI app generators: production safety before launch', 'Generated full-stack apps need runtime trust on auth, payments, and email — not just prompt disclaimers.', ['lovable', 'developer', 'startup', 'acquisition'], 6],
  ['bolt-new-v0-agent-deployment-gates', 'Bolt.new and v0 agents: deployment gates for vibe-coded apps', 'One-click deploy is fast — add three Shield Rules before sharing a URL with paying users.', ['bolt', 'v0', 'developer', 'acquisition'], 5],
  ['claude-code-cli-tool-verification', 'Claude Code CLI: tool verification for terminal agents', 'Terminal agents run shell commands — verify rm, curl exfil, and cloud CLI actions before execution.', ['claude', 'anthropic', 'developer', 'acquisition'], 6],
  ['openai-codex-agent-side-effect-controls', 'OpenAI Codex-class agents: side-effect controls', 'Code agents that open PRs and run CI need approve/block on merge, release, and secret-touching steps.', ['openai', 'developer', 'security', 'acquisition'], 6],
  ['tabnine-enterprise-agent-policy-layer', 'Tabnine Enterprise and agent policy layers', 'Code completion vs autonomous agents — when to add runtime trust on top of IDE security features.', ['tabnine', 'enterprise', 'developer', 'acquisition'], 5],

  // Chat / search AI platforms (8)
  ['chatgpt-gpt-actions-enterprise-security', 'ChatGPT GPT Actions enterprise security', 'Custom GPTs with Actions can call your APIs — gate server-side execution, not just OpenAI policies.', ['chatgpt', 'openai', 'enterprise', 'acquisition'], 7],
  ['claude-projects-mcp-connector-governance', 'Claude Projects MCP connectors: governance playbook', 'MCP connectors multiply tool surface — schema-aware policies and human review for high-risk tools.', ['claude', 'anthropic', 'mcp', 'acquisition'], 6],
  ['perplexity-pro-search-agent-actions', 'Perplexity Pro and search agents: action safety', 'Search-plus-action products need clear boundaries on purchases, bookings, and account changes.', ['perplexity', 'search', 'ai-agents', 'acquisition'], 5],
  ['grok-xai-api-tool-use-safety', 'Grok and xAI API tool-use safety', 'Fast-moving chat APIs still need execution-layer controls when tools touch money or private data.', ['grok', 'xai', 'api', 'acquisition'], 5],
  ['meta-ai-business-agent-controls', 'Meta AI business agents: controls for WhatsApp and ads automation', 'Business messaging agents need approval queues before bulk sends, refunds, and ad spend changes.', ['meta', 'business', 'acquisition'], 6],
  ['anthropic-computer-use-agent-safety', 'Anthropic computer use agents: safety for desktop automation', 'Screen agents can click anything — gate transfers, sends, and admin settings with runtime policy.', ['anthropic', 'computer-use', 'security', 'acquisition'], 7],
  ['openai-operator-browser-agent-safety', 'OpenAI Operator-style browser agents: safety checklist', 'Browser autonomy is prompt-injection heaven — pre-execution gates and source-trust tiers are mandatory.', ['openai', 'browser', 'prompt-injection', 'acquisition'], 7],
  ['amazon-bedrock-agents-execution-verification', 'Amazon Bedrock Agents: execution verification patterns', 'Action groups and knowledge bases — verify before Lambda side effects and cross-account calls.', ['bedrock', 'aws', 'enterprise', 'acquisition'], 7],

  // Social & community platforms (12)
  ['linkedin-automation-ai-agent-approval', 'LinkedIn automation AI agents: approval before posts and DMs', 'Growth teams use agents for outreach — gate connection requests, InMail, and post publishing.', ['linkedin', 'social', 'marketing', 'acquisition'], 6],
  ['twitter-x-ai-bot-post-approval-gates', 'X (Twitter) AI bots: post approval gates', 'Autonomous posting risks brand damage — require verification for tweets, DMs, and ad spend APIs.', ['twitter', 'x', 'social', 'acquisition'], 5],
  ['facebook-messenger-ai-agent-policy', 'Facebook Messenger AI agents: policy and human review', 'Page bots that refund, message, or modify ads need execution-time controls and audit trails.', ['facebook', 'meta', 'social', 'acquisition'], 6],
  ['instagram-dm-automation-human-review', 'Instagram DM automation: human review that scales', 'Creator and commerce bots should not send payment links or bulk DMs without held-action review.', ['instagram', 'social', 'acquisition'], 5],
  ['tiktok-shop-ai-agent-payment-controls', 'TikTok Shop AI agents: payment and listing controls', 'Short-video commerce agents need spend caps and verify-before-checkout for creator storefronts.', ['tiktok', 'social', 'agentic-commerce', 'acquisition'], 6],
  ['reddit-mod-ai-agent-tool-limits', 'Reddit mod AI agents: tool limits and escalation', 'Community automation can ban users or change settings — gate destructive mod tools.', ['reddit', 'social', 'acquisition'], 5],
  ['youtube-community-ai-moderation-gates', 'YouTube community AI moderation gates', 'Auto-moderation agents need policy on strikes, deletes, and channel settings — with human escalation.', ['youtube', 'social', 'acquisition'], 6],
  ['discord-bot-ai-admin-action-verification', 'Discord bot AI admin action verification', 'Server bots with admin scopes can kick, ban, and webhook — verify high-impact Discord API calls.', ['discord', 'social', 'acquisition'], 5],
  ['slack-ai-agent-workflow-approval', 'Slack AI agent workflow approval', 'Slack-native agents post, spend, and trigger workflows — mirror your email gates for channel actions.', ['slack', 'social', 'workflow', 'acquisition'], 6],
  ['threads-meta-ai-posting-controls', 'Threads AI posting controls for brand accounts', 'Cross-posting agents should not publish without review during crises or compromised sessions.', ['threads', 'meta', 'social', 'acquisition'], 5],
  ['bluesky-atproto-agent-automation-safety', 'Bluesky ATProto agent automation safety', 'Decentralized social still needs centralized policy — gate follows, posts, and list mutations.', ['bluesky', 'social', 'acquisition'], 5],
  ['whatsapp-business-ai-message-approval', 'WhatsApp Business AI message approval', 'Template and session messages at scale need verify-before-send for refunds and account changes.', ['whatsapp', 'meta', 'social', 'acquisition'], 6],

  // News / Yahoo-style / buyer urgency (6)
  ['yahoo-finance-ai-trading-bot-risk-controls', 'Yahoo Finance-era AI trading bots: risk controls', 'Retail trading automation spikes in news cycles — dedicated wallets and kill switches before hype deploys.', ['finance', 'news', 'trading', 'acquisition'], 6],
  ['ai-agent-security-after-headline-incidents-2026', 'AI agent security after headline incidents in 2026', 'When breaches make Google News — what CISOs buy in week one: execution gates, audit, fleet pause.', ['news', 'ciso', 'incident-response', 'acquisition'], 7, true],
  ['ciso-checklist-agent-execution-gates-2026', 'CISO checklist: agent execution gates for 2026', 'Ten controls security leaders expect before approving autonomous spend, email, and prod access.', ['ciso', 'checklist', 'enterprise', 'acquisition'], 7],
  ['insurance-renewal-ai-agent-controls-evidence', 'Insurance renewal: AI agent controls evidence pack', 'What brokers request after agentic AI claims — document kill switch, approvals, and audit exports.', ['insurance', 'compliance', 'acquisition'], 6],
  ['google-news-ai-agent-governance-buying-guide', 'Google News and AI agent governance: a buying guide', 'Translate press cycles into procurement — gateways vs identity vs runtime execution.', ['news', 'google-news', 'buyers-guide', 'acquisition'], 6],
  ['yahoo-search-ai-agent-approval-answers', 'Yahoo Search and AI agent approval: direct answers', 'Classic portal-style queries on approval software — concise answers with a clear product path.', ['yahoo', 'paa', 'seo', 'acquisition'], 5],

  // Automation / SaaS integrations (8)
  ['zapier-ai-actions-approval-workflow', 'Zapier AI actions: approval workflow without rebuilding Zaps', 'Keep Zapier for glue — verify before Gmail, Stripe, and Salesforce steps via Sanctum Connect.', ['zapier', 'automation', 'workflow', 'acquisition'], 5],
  ['make-com-scenario-agent-gates', 'Make.com scenarios with agent gates', 'Visual automation plus LLM steps — gate modules that move money or PII.', ['make', 'automation', 'acquisition'], 5],
  ['hubspot-ai-agent-crm-write-controls', 'HubSpot AI agents: CRM write controls', 'Breeze and workflow agents should not bulk-update deals or send sequences without verification.', ['hubspot', 'crm', 'sales', 'acquisition'], 6],
  ['salesforce-agentforce-execution-verification', 'Salesforce Agentforce execution verification', 'Agentforce actions on records and cases — runtime trust before irreversible CRM side effects.', ['salesforce', 'crm', 'enterprise', 'acquisition'], 7],
  ['servicenow-now-assist-agent-governance', 'ServiceNow Now Assist agent governance', 'ITSM agents that open incidents and change records need dual approval on production changes.', ['servicenow', 'itsm', 'enterprise', 'acquisition'], 6],
  ['workday-ai-agent-hr-action-approval', 'Workday AI agents: HR action approval', 'Payroll and headcount agents require human review — policy packs for regulated HR workflows.', ['workday', 'hr', 'compliance', 'acquisition'], 6],
  ['sap-joule-agent-financial-controls', 'SAP Joule agents: financial controls', 'ERP agents touching POs and journals — execution verification aligned with SOX expectations.', ['sap', 'finance', 'enterprise', 'acquisition'], 7],
  ['databricks-agent-brick-warehouse-gates', 'Databricks AI agents: warehouse and job gates', 'Genie and agent bricks that run SQL and jobs — verify before destructive warehouse operations.', ['databricks', 'data', 'enterprise', 'acquisition'], 6],

  // Frameworks / protocols (8)
  ['langgraph-multi-agent-approval-patterns', 'LangGraph multi-agent approval patterns', 'Supervisor graphs still need one execution boundary — verify at tool nodes, not only in prompts.', ['langgraph', 'langchain', 'multi-agent', 'acquisition'], 6],
  ['autogen-group-chat-agent-gates', 'AutoGen group chat agent gates', 'Multi-agent conversations can amplify mistakes — gate shared tools and human handoff points.', ['autogen', 'multi-agent', 'acquisition'], 6],
  ['openai-swarm-multi-agent-runtime-trust', 'OpenAI Swarm-style multi-agent runtime trust', 'Handoffs between agents should not bypass policy — central verifyAction for all tool executors.', ['swarm', 'openai', 'multi-agent', 'acquisition'], 5],
  ['llamaindex-agent-tool-verification', 'LlamaIndex agent tool verification', 'Query engines and agents — wrap tool calls with consistent policy from the console.', ['llamaindex', 'sdk', 'acquisition'], 5],
  ['haystack-ai-pipeline-action-gates', 'Haystack AI pipeline action gates', 'RAG pipelines that trigger writes or emails — add execution checks on pipeline tool steps.', ['haystack', 'rag', 'acquisition'], 5],
  ['mcp-registry-third-party-server-trust', 'MCP registry and third-party server trust', 'Installing community MCP servers? Treat them like supply chain — schema + pre-execution policy.', ['mcp', 'supply-chain', 'security', 'acquisition'], 7],
  ['agent2agent-protocol-trust-boundaries', 'Agent2Agent protocol trust boundaries', 'Cross-vendor agent messaging needs delegation limits and verify-before-forward for side effects.', ['a2a', 'protocol', 'multi-agent', 'acquisition'], 6],
  ['connect-agent-openai-claude-gemini-unified', 'Sanctum Connect: one gate for OpenAI, Claude, and Gemini agents', 'Connect Agent proxies tool calls with verify — one console for multi-provider fleets.', ['connect', 'multi-model', 'get-started', 'acquisition'], 6, true],

  // Startup and founder acquisition (10)
  ['ai-agent-safety-pilot-for-startups', 'AI agent safety pilot for startup teams', 'Protect one real agent action, show runtime approval, and turn safety into customer trust before launch.', ['founder', 'startup', 'get-started', 'acquisition'], 6, true],
  ['founder-guide-runtime-trust-before-launch', 'Founder guide: runtime trust before your agent launch', 'Pre-launch checklist: three actions gated, mobile approve tested, audit export saved for investors.', ['founder', 'startup', 'checklist', 'acquisition'], 5],
  ['indie-hacker-ai-saas-agent-gates-weekend', 'Indie hacker AI SaaS: agent gates in one weekend', 'Solo founders can gate send_email and stripe charges Saturday — ship Sunday with confidence.', ['indie-hacker', 'startup', 'get-started', 'acquisition'], 5],
  ['product-hunt-launch-agentic-ai-safely', 'Product Hunt launch: ship agentic AI safely', 'Hunters ask about safety — show live approve/block in demo and link your trust center.', ['product-hunt', 'launch', 'marketing', 'acquisition'], 5],
  ['hackernews-ai-agent-security-what-to-build', 'Hacker News AI agent security: what builders actually need', 'HN threads converge on execution proof — open-core runtime + console beats another governance PDF.', ['hackernews', 'developer', 'open-core', 'acquisition'], 6],
  ['github-stars-to-production-agent-controls', 'From GitHub stars to production agent controls', 'OSS traction means scrutiny — add runtime trust before enterprise pilots ask for your SOC packet.', ['github', 'open-core', 'enterprise', 'acquisition'], 5],
  ['startup-seo-ai-agent-security-keywords', 'Startup SEO: AI agent security keywords that convert', 'Long-tail queries on approval, MCP, and kill switch — content map for agent teams ready to deploy.', ['seo', 'startup', 'marketing', 'acquisition'], 6],
  ['free-console-ai-agent-approval-no-sales-call', 'Free console: AI agent approval with no sales call', 'Sign in, gate one action, export audit — frictionless path for technical buyers from search and social.', ['sign-up', 'get-started', 'console', 'acquisition'], 4, true],
  ['invite-team-ai-agent-console-onboarding', 'Invite your team: AI agent console onboarding in 15 minutes', 'Second user is often security or ops — shared Shield Rules and Fleet pause without custom RBAC build.', ['team', 'onboarding', 'console', 'acquisition'], 5],
  ['yc-batch-agent-security-one-pager', 'YC batch agent security one-pager for investors', 'What to show partners: policy version, held actions, fleet pause — evidence in one export.', ['yc', 'startup', 'compliance', 'acquisition'], 5],
]

const existing = collectExistingSlugs()
const collisions = POSTS.filter(([slug]) => existing.has(slug))
if (collisions.length) {
  console.error('Slug collisions with existing posts:', collisions.map((p) => p[0]))
  process.exit(1)
}
if (POSTS.length !== 80) {
  console.error(`Expected 80 posts, got ${POSTS.length}`)
  process.exit(1)
}

const date = '2026-05-30'

const postsArray = POSTS.map(([slug, title, description, tags, readTime = 6, featured]) => {
  const f = featured ? ', featured: true' : ''
  return `  { slug: '${slug}', title: ${JSON.stringify(title)}, description: ${JSON.stringify(description)}, publishedAt: date, tags: ${JSON.stringify(tags)}, readTime: ${readTime}${f} },`
}).join('\n')

const featuredSlugs = POSTS.filter((p) => p[5]).map((p) => p[0])

const customAnswers = featuredSlugs
  .slice(0, 8)
  .map(
    (slug) => `'${slug}': acq(
    '${slug}',
    'Teams discover Sanctum through search, AI assistants, and social — this article answers that intent with a clear path to console.sanctumruntime.com.',
    [
      'Execution gates beat post-hoc monitoring when agents can spend, email, or touch prod.',
      'Open-core SDK + hosted console fits founders and enterprise pilots alike.',
      'Mobile PWA approval removes the need to build operator apps.',
    ],
    [
      'Sign in at console.sanctumruntime.com.',
      'Agents → create agent → Shield Rule on your riskiest action.',
      'Trigger once → approve on Overview → export Audit sample.',
    ],
    ['sanctum-runtime-free-trial-get-started', 'first-production-agent-gate-this-weekend'],
  ),`,
  )
  .join('\n')

const out = `import type { BlogPostMeta } from './blog-posts'
import type { BlogAnswerPost } from './blog-answers'

const date = '${date}'

/** Acquisition posts — search, PAA, news, social, and platform-specific discovery (80 unique slugs). */
export const BLOG_ACQUISITION_POSTS: BlogPostMeta[] = [
${postsArray}
]

type AcqAnswer = BlogAnswerPost & { channel: string }

function acq(
  _slug: string,
  intro: string,
  keyPoints: string[],
  checklist: string[],
  related: string[],
  channel = 'search and AI discovery',
): AcqAnswer {
  return {
    intro,
    channel,
    keyPoints,
    checklist,
    answers: [
      {
        question: 'Where should I start if this article matches my search?',
        answer:
          'Open console.sanctumruntime.com, connect one agent with @sanctum-runtime/sdk, and gate one real action today. No sales call required for the first approval workflow.',
      },
      {
        question: 'Does Sanctum replace my model provider or gateway?',
        answer:
          'No. Sanctum sits at the action boundary — approve, verify, or block tool side effects — alongside OpenAI, Anthropic, Google, Microsoft, or gateway vendors.',
      },
      {
        question: 'How does this help us reach production safely?',
        answer:
          'You get policy versioning, human review queues, fleet pause, and audit exports — the artifacts security, finance, and insurance reviewers ask for when agents act autonomously.',
      },
    ],
    related,
  }
}

function defaultAcq(slug: string, post: BlogPostMeta): BlogAnswerPost {
  const channel =
    post.tags.find((t) =>
      ['linkedin', 'twitter', 'x', 'tiktok', 'instagram', 'facebook', 'youtube', 'discord', 'slack', 'reddit', 'threads', 'bluesky', 'whatsapp'].includes(t),
    ) ??
    post.tags.find((t) => ['microsoft', 'azure', 'copilot', 'bing'].includes(t)) ??
    post.tags.find((t) => ['google-cloud', 'gemini', 'vertex'].includes(t)) ??
    'search, news, and AI platforms'

  const { channel: _c, ...base } = acq(
    slug,
    \`\${post.description} If you found this via \${channel}, you likely need software this week — not another strategy deck. Sanctum Runtime combines an MIT SDK with a hosted console for execution-time approve, verify, and block.\`,
    [
      \`Discovery channel: \${channel} — intent is deploy or compare, not casual reading.\`,
      'Runtime trust gates side effects before they run; guardrails alone miss tool calls.',
      'Successful pilots typically gate email, payments, or production writes in week one.',
    ],
    [
      'Console → Agents → register agent → copy SDK snippet.',
      'Shield Rules → Verify on highest-risk action for your stack.',
      'Run one held action → approve on Overview or mobile PWA.',
      'Compliance → export audit sample for security or investor review.',
    ],
    post.tags.includes('connect')
      ? ['connect-agent-openai-claude-gemini-unified', 'mcp-server-action-gate']
      : post.tags.includes('founder') || post.tags.includes('startup')
        ? ['ai-agent-safety-pilot-for-startups', 'sanctum-runtime-free-trial-get-started']
        : ['people-also-ask-ai-agent-approval-software', 'best-ai-agent-security-software-2026'],
    channel,
  )
  return base
}

const ACQ_CUSTOM: Record<string, AcqAnswer> = {
${customAnswers}
}

export const BLOG_ACQUISITION_ANSWERS: Record<string, BlogAnswerPost> = Object.fromEntries(
  BLOG_ACQUISITION_POSTS.map((p) => {
    const custom = ACQ_CUSTOM[p.slug]
    if (custom) {
      const { channel: _ch, ...rest } = custom
      return [p.slug, rest]
    }
    return [p.slug, defaultAcq(p.slug, p)]
  }),
)
`

writeFileSync(resolve(root, 'src/lib/blog-acquisition-posts.ts'), out, 'utf8')
console.log(`Wrote ${POSTS.length} acquisition posts to src/lib/blog-acquisition-posts.ts`)
