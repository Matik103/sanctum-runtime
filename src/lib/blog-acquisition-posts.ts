import type { BlogPostMeta } from './blog-posts'
import type { BlogAnswerPost } from './blog-answers'

const date = '2026-05-30'

/** Acquisition posts — search, PAA, news, social, and platform-specific discovery (80 unique slugs). */
export const BLOG_ACQUISITION_POSTS: BlogPostMeta[] = [
  { slug: 'google-agent-gateway-mcp-security-2026', title: "Google Agent Gateway and MCP security in 2026", description: "What Google Cloud Next announced for agent gateways, managed MCP, and where execution-time gates still belong in your stack.", publishedAt: date, tags: ["google-cloud","mcp","news","acquisition"], readTime: 7, featured: true },
  { slug: 'google-model-armor-vs-runtime-execution-gates', title: "Google Model Armor vs runtime execution gates", description: "Model Armor filters unsafe content — agents still need approve/block before emails, payments, and API writes run.", publishedAt: date, tags: ["google-cloud","comparison","runtime-trust","acquisition"], readTime: 6 },
  { slug: 'google-cloud-next-2026-agent-identity-lessons', title: "Google Cloud Next 2026: agent identity lessons for builders", description: "Agent Identity, IAM deny policies, and BYOSA — practical takeaways for teams shipping autonomous tools this quarter.", publishedAt: date, tags: ["google-cloud","identity","news","acquisition"], readTime: 7 },
  { slug: 'gemini-enterprise-agent-tool-use-controls', title: "Gemini enterprise agents: tool-use controls that scale", description: "How to gate Gemini function calling and Vertex agents without slowing product teams — console-first pattern.", publishedAt: date, tags: ["gemini","google-cloud","tool-use","acquisition"], readTime: 6 },
  { slug: 'google-a2a-agent-protocol-security-baseline', title: "Google A2A agent protocol: security baseline for multi-agent systems", description: "Agent-to-agent messaging needs trust boundaries — identity, scoped delegation, and execution verification.", publishedAt: date, tags: ["a2a","multi-agent","security","acquisition"], readTime: 7 },
  { slug: 'vertex-managed-mcp-servers-production-hardening', title: "Vertex managed MCP servers: production hardening checklist", description: "Schema validation, least privilege, and pre-execution policy for payment and file tools on managed MCP.", publishedAt: date, tags: ["vertex","mcp","security","acquisition"], readTime: 7 },
  { slug: 'google-iam-deny-policies-for-ai-service-agents', title: "Google IAM deny policies for AI service agents", description: "Deny policies reduce blast radius — pair cloud IAM with action-layer gates for defense in depth.", publishedAt: date, tags: ["google-cloud","iam","security","acquisition"], readTime: 6 },
  { slug: 'google-ai-overviews-and-agent-trust-for-teams', title: "Google AI Overviews and agent trust: what product teams should build", description: "Search UX is shifting — customers will expect the same transparency and controls from your autonomous features.", publishedAt: date, tags: ["seo","google-search","trust","acquisition"], readTime: 5 },
  { slug: 'people-also-ask-ai-agent-approval-software', title: "People Also Ask: best AI agent approval software (answered for 2026)", description: "Direct answers to PAA-style queries on approval platforms, pricing, and fastest path to production gates.", publishedAt: date, tags: ["paa","seo","human-in-the-loop","acquisition"], readTime: 6, featured: true },
  { slug: 'bing-copilot-enterprise-agent-execution-controls', title: "Bing and Copilot enterprise: where execution controls fit", description: "Microsoft discovery traffic often lands on Copilot governance — this is what to add for real approve/block.", publishedAt: date, tags: ["bing","microsoft","copilot","acquisition"], readTime: 6 },
  { slug: 'microsoft-copilot-studio-action-approval-patterns', title: "Microsoft Copilot Studio: action approval patterns", description: "Power Platform agents can trigger real side effects — route high-impact actions through runtime verification.", publishedAt: date, tags: ["copilot","microsoft","power-platform","acquisition"], readTime: 6 },
  { slug: 'azure-ai-foundry-agent-security-baseline', title: "Azure AI Foundry agent security baseline", description: "Foundry deployments need tool governance, secrets hygiene, and execution gates before production traffic.", publishedAt: date, tags: ["azure","microsoft","security","acquisition"], readTime: 7 },
  { slug: 'semantic-kernel-tool-calling-verification', title: "Semantic Kernel tool calling with verification", description: "Wrap SK plugins and planners with verifyAction so policy stays consistent across .NET and Python agents.", publishedAt: date, tags: ["semantic-kernel","microsoft","sdk","acquisition"], readTime: 6 },
  { slug: 'power-automate-ai-flow-governance', title: "Power Automate AI flows: governance without killing automation", description: "Gate cloud flows that send email, update records, or spend budget — keep low-risk steps fast.", publishedAt: date, tags: ["power-automate","microsoft","workflow","acquisition"], readTime: 6 },
  { slug: 'microsoft-entra-agent-identity-gaps', title: "Microsoft Entra and agent identity: gaps execution gates fill", description: "Identity proves who the agent is — runtime trust decides whether this specific action should run now.", publishedAt: date, tags: ["entra","microsoft","identity","acquisition"], readTime: 6 },
  { slug: 'fabric-copilot-agents-data-plane-security', title: "Microsoft Fabric Copilot agents: data-plane security", description: "Warehouse and pipeline agents need row-level awareness plus pre-execution policy on exports and writes.", publishedAt: date, tags: ["fabric","microsoft","data","acquisition"], readTime: 7 },
  { slug: 'windows-copilot-actions-runtime-trust', title: "Windows Copilot actions and runtime trust on endpoints", description: "OS-level assistants can open apps and files — enterprise teams should gate destructive and exfiltration paths.", publishedAt: date, tags: ["windows","copilot","endpoint","acquisition"], readTime: 6 },
  { slug: 'microsoft-agent-365-plus-execution-gates', title: "Microsoft Agent 365 plus execution gates: combined reference architecture", description: "Inventory and governance from Agent 365 — add Sanctum-style verification where side effects happen.", publishedAt: date, tags: ["agent-365","microsoft","architecture","acquisition"], readTime: 7 },
  { slug: 'cursor-ai-agent-production-guardrails', title: "Cursor AI agents: production guardrails before you ship", description: "IDE agents can edit repos and run terminals — gate prod deploys, secrets access, and customer data paths.", publishedAt: date, tags: ["cursor","developer","get-started","acquisition"], readTime: 6, featured: true },
  { slug: 'windsurf-cascade-agent-tool-security', title: "Windsurf Cascade agent tool security", description: "Multi-file agents need one execution boundary — verify before git push, API calls, and cloud deploy hooks.", publishedAt: date, tags: ["windsurf","developer","security","acquisition"], readTime: 5 },
  { slug: 'github-copilot-workspace-agent-controls', title: "GitHub Copilot Workspace agent controls", description: "Workspace-style autonomy should not merge or deploy without policy — practical gating for eng leads.", publishedAt: date, tags: ["github","copilot","developer","acquisition"], readTime: 6 },
  { slug: 'devin-autonomous-engineer-spend-and-deploy-gates', title: "Devin-style autonomous engineers: spend and deploy gates", description: "Autonomous coding agents touch billing and production — wallet limits plus verify on deploy and spend.", publishedAt: date, tags: ["devin","developer","payments","acquisition"], readTime: 7 },
  { slug: 'replit-agent-database-write-protection', title: "Replit Agent database write protection", description: "Sandbox agents still reach real DBs in staging — gate INSERT/UPDATE/DELETE and schema migrations.", publishedAt: date, tags: ["replit","developer","database","acquisition"], readTime: 5 },
  { slug: 'lovable-ai-app-generator-production-safety', title: "Lovable AI app generators: production safety before launch", description: "Generated full-stack apps need runtime trust on auth, payments, and email — not just prompt disclaimers.", publishedAt: date, tags: ["lovable","developer","startup","acquisition"], readTime: 6 },
  { slug: 'bolt-new-v0-agent-deployment-gates', title: "Bolt.new and v0 agents: deployment gates for vibe-coded apps", description: "One-click deploy is fast — add three Shield Rules before sharing a URL with paying users.", publishedAt: date, tags: ["bolt","v0","developer","acquisition"], readTime: 5 },
  { slug: 'claude-code-cli-tool-verification', title: "Claude Code CLI: tool verification for terminal agents", description: "Terminal agents run shell commands — verify rm, curl exfil, and cloud CLI actions before execution.", publishedAt: date, tags: ["claude","anthropic","developer","acquisition"], readTime: 6 },
  { slug: 'openai-codex-agent-side-effect-controls', title: "OpenAI Codex-class agents: side-effect controls", description: "Code agents that open PRs and run CI need approve/block on merge, release, and secret-touching steps.", publishedAt: date, tags: ["openai","developer","security","acquisition"], readTime: 6 },
  { slug: 'tabnine-enterprise-agent-policy-layer', title: "Tabnine Enterprise and agent policy layers", description: "Code completion vs autonomous agents — when to add runtime trust on top of IDE security features.", publishedAt: date, tags: ["tabnine","enterprise","developer","acquisition"], readTime: 5 },
  { slug: 'chatgpt-gpt-actions-enterprise-security', title: "ChatGPT GPT Actions enterprise security", description: "Custom GPTs with Actions can call your APIs — gate server-side execution, not just OpenAI policies.", publishedAt: date, tags: ["chatgpt","openai","enterprise","acquisition"], readTime: 7 },
  { slug: 'claude-projects-mcp-connector-governance', title: "Claude Projects MCP connectors: governance playbook", description: "MCP connectors multiply tool surface — schema-aware policies and human review for high-risk tools.", publishedAt: date, tags: ["claude","anthropic","mcp","acquisition"], readTime: 6 },
  { slug: 'perplexity-pro-search-agent-actions', title: "Perplexity Pro and search agents: action safety", description: "Search-plus-action products need clear boundaries on purchases, bookings, and account changes.", publishedAt: date, tags: ["perplexity","search","ai-agents","acquisition"], readTime: 5 },
  { slug: 'grok-xai-api-tool-use-safety', title: "Grok and xAI API tool-use safety", description: "Fast-moving chat APIs still need execution-layer controls when tools touch money or private data.", publishedAt: date, tags: ["grok","xai","api","acquisition"], readTime: 5 },
  { slug: 'meta-ai-business-agent-controls', title: "Meta AI business agents: controls for WhatsApp and ads automation", description: "Business messaging agents need approval queues before bulk sends, refunds, and ad spend changes.", publishedAt: date, tags: ["meta","business","acquisition"], readTime: 6 },
  { slug: 'anthropic-computer-use-agent-safety', title: "Anthropic computer use agents: safety for desktop automation", description: "Screen agents can click anything — gate transfers, sends, and admin settings with runtime policy.", publishedAt: date, tags: ["anthropic","computer-use","security","acquisition"], readTime: 7 },
  { slug: 'openai-operator-browser-agent-safety', title: "OpenAI Operator-style browser agents: safety checklist", description: "Browser autonomy is prompt-injection heaven — pre-execution gates and source-trust tiers are mandatory.", publishedAt: date, tags: ["openai","browser","prompt-injection","acquisition"], readTime: 7 },
  { slug: 'amazon-bedrock-agents-execution-verification', title: "Amazon Bedrock Agents: execution verification patterns", description: "Action groups and knowledge bases — verify before Lambda side effects and cross-account calls.", publishedAt: date, tags: ["bedrock","aws","enterprise","acquisition"], readTime: 7 },
  { slug: 'linkedin-automation-ai-agent-approval', title: "LinkedIn automation AI agents: approval before posts and DMs", description: "Growth teams use agents for outreach — gate connection requests, InMail, and post publishing.", publishedAt: date, tags: ["linkedin","social","marketing","acquisition"], readTime: 6 },
  { slug: 'twitter-x-ai-bot-post-approval-gates', title: "X (Twitter) AI bots: post approval gates", description: "Autonomous posting risks brand damage — require verification for tweets, DMs, and ad spend APIs.", publishedAt: date, tags: ["twitter","x","social","acquisition"], readTime: 5 },
  { slug: 'facebook-messenger-ai-agent-policy', title: "Facebook Messenger AI agents: policy and human review", description: "Page bots that refund, message, or modify ads need execution-time controls and audit trails.", publishedAt: date, tags: ["facebook","meta","social","acquisition"], readTime: 6 },
  { slug: 'instagram-dm-automation-human-review', title: "Instagram DM automation: human review that scales", description: "Creator and commerce bots should not send payment links or bulk DMs without held-action review.", publishedAt: date, tags: ["instagram","social","acquisition"], readTime: 5 },
  { slug: 'tiktok-shop-ai-agent-payment-controls', title: "TikTok Shop AI agents: payment and listing controls", description: "Short-video commerce agents need spend caps and verify-before-checkout for creator storefronts.", publishedAt: date, tags: ["tiktok","social","agentic-commerce","acquisition"], readTime: 6 },
  { slug: 'reddit-mod-ai-agent-tool-limits', title: "Reddit mod AI agents: tool limits and escalation", description: "Community automation can ban users or change settings — gate destructive mod tools.", publishedAt: date, tags: ["reddit","social","acquisition"], readTime: 5 },
  { slug: 'youtube-community-ai-moderation-gates', title: "YouTube community AI moderation gates", description: "Auto-moderation agents need policy on strikes, deletes, and channel settings — with human escalation.", publishedAt: date, tags: ["youtube","social","acquisition"], readTime: 6 },
  { slug: 'discord-bot-ai-admin-action-verification', title: "Discord bot AI admin action verification", description: "Server bots with admin scopes can kick, ban, and webhook — verify high-impact Discord API calls.", publishedAt: date, tags: ["discord","social","acquisition"], readTime: 5 },
  { slug: 'slack-ai-agent-workflow-approval', title: "Slack AI agent workflow approval", description: "Slack-native agents post, spend, and trigger workflows — mirror your email gates for channel actions.", publishedAt: date, tags: ["slack","social","workflow","acquisition"], readTime: 6 },
  { slug: 'threads-meta-ai-posting-controls', title: "Threads AI posting controls for brand accounts", description: "Cross-posting agents should not publish without review during crises or compromised sessions.", publishedAt: date, tags: ["threads","meta","social","acquisition"], readTime: 5 },
  { slug: 'bluesky-atproto-agent-automation-safety', title: "Bluesky ATProto agent automation safety", description: "Decentralized social still needs centralized policy — gate follows, posts, and list mutations.", publishedAt: date, tags: ["bluesky","social","acquisition"], readTime: 5 },
  { slug: 'whatsapp-business-ai-message-approval', title: "WhatsApp Business AI message approval", description: "Template and session messages at scale need verify-before-send for refunds and account changes.", publishedAt: date, tags: ["whatsapp","meta","social","acquisition"], readTime: 6 },
  { slug: 'yahoo-finance-ai-trading-bot-risk-controls', title: "Yahoo Finance-era AI trading bots: risk controls", description: "Retail trading automation spikes in news cycles — dedicated wallets and kill switches before hype deploys.", publishedAt: date, tags: ["finance","news","trading","acquisition"], readTime: 6 },
  { slug: 'ai-agent-security-after-headline-incidents-2026', title: "AI agent security after headline incidents in 2026", description: "When breaches make Google News — what CISOs buy in week one: execution gates, audit, fleet pause.", publishedAt: date, tags: ["news","ciso","incident-response","acquisition"], readTime: 7, featured: true },
  { slug: 'ciso-checklist-agent-execution-gates-2026', title: "CISO checklist: agent execution gates for 2026", description: "Ten controls security leaders expect before approving autonomous spend, email, and prod access.", publishedAt: date, tags: ["ciso","checklist","enterprise","acquisition"], readTime: 7 },
  { slug: 'insurance-renewal-ai-agent-controls-evidence', title: "Insurance renewal: AI agent controls evidence pack", description: "What brokers request after agentic AI claims — document kill switch, approvals, and audit exports.", publishedAt: date, tags: ["insurance","compliance","acquisition"], readTime: 6 },
  { slug: 'google-news-ai-agent-governance-buying-guide', title: "Google News and AI agent governance: a buying guide", description: "Translate press cycles into procurement — gateways vs identity vs runtime execution.", publishedAt: date, tags: ["news","google-news","buyers-guide","acquisition"], readTime: 6 },
  { slug: 'yahoo-search-ai-agent-approval-answers', title: "Yahoo Search and AI agent approval: direct answers", description: "Classic portal-style queries on approval software — concise answers with a clear product path.", publishedAt: date, tags: ["yahoo","paa","seo","acquisition"], readTime: 5 },
  { slug: 'zapier-ai-actions-approval-workflow', title: "Zapier AI actions: approval workflow without rebuilding Zaps", description: "Keep Zapier for glue — verify before Gmail, Stripe, and Salesforce steps via Sanctum Connect.", publishedAt: date, tags: ["zapier","automation","workflow","acquisition"], readTime: 5 },
  { slug: 'make-com-scenario-agent-gates', title: "Make.com scenarios with agent gates", description: "Visual automation plus LLM steps — gate modules that move money or PII.", publishedAt: date, tags: ["make","automation","acquisition"], readTime: 5 },
  { slug: 'hubspot-ai-agent-crm-write-controls', title: "HubSpot AI agents: CRM write controls", description: "Breeze and workflow agents should not bulk-update deals or send sequences without verification.", publishedAt: date, tags: ["hubspot","crm","sales","acquisition"], readTime: 6 },
  { slug: 'salesforce-agentforce-execution-verification', title: "Salesforce Agentforce execution verification", description: "Agentforce actions on records and cases — runtime trust before irreversible CRM side effects.", publishedAt: date, tags: ["salesforce","crm","enterprise","acquisition"], readTime: 7 },
  { slug: 'servicenow-now-assist-agent-governance', title: "ServiceNow Now Assist agent governance", description: "ITSM agents that open incidents and change records need dual approval on production changes.", publishedAt: date, tags: ["servicenow","itsm","enterprise","acquisition"], readTime: 6 },
  { slug: 'workday-ai-agent-hr-action-approval', title: "Workday AI agents: HR action approval", description: "Payroll and headcount agents require human review — policy packs for regulated HR workflows.", publishedAt: date, tags: ["workday","hr","compliance","acquisition"], readTime: 6 },
  { slug: 'sap-joule-agent-financial-controls', title: "SAP Joule agents: financial controls", description: "ERP agents touching POs and journals — execution verification aligned with SOX expectations.", publishedAt: date, tags: ["sap","finance","enterprise","acquisition"], readTime: 7 },
  { slug: 'databricks-agent-brick-warehouse-gates', title: "Databricks AI agents: warehouse and job gates", description: "Genie and agent bricks that run SQL and jobs — verify before destructive warehouse operations.", publishedAt: date, tags: ["databricks","data","enterprise","acquisition"], readTime: 6 },
  { slug: 'langgraph-multi-agent-approval-patterns', title: "LangGraph multi-agent approval patterns", description: "Supervisor graphs still need one execution boundary — verify at tool nodes, not only in prompts.", publishedAt: date, tags: ["langgraph","langchain","multi-agent","acquisition"], readTime: 6 },
  { slug: 'autogen-group-chat-agent-gates', title: "AutoGen group chat agent gates", description: "Multi-agent conversations can amplify mistakes — gate shared tools and human handoff points.", publishedAt: date, tags: ["autogen","multi-agent","acquisition"], readTime: 6 },
  { slug: 'openai-swarm-multi-agent-runtime-trust', title: "OpenAI Swarm-style multi-agent runtime trust", description: "Handoffs between agents should not bypass policy — central verifyAction for all tool executors.", publishedAt: date, tags: ["swarm","openai","multi-agent","acquisition"], readTime: 5 },
  { slug: 'llamaindex-agent-tool-verification', title: "LlamaIndex agent tool verification", description: "Query engines and agents — wrap tool calls with consistent policy from the console.", publishedAt: date, tags: ["llamaindex","sdk","acquisition"], readTime: 5 },
  { slug: 'haystack-ai-pipeline-action-gates', title: "Haystack AI pipeline action gates", description: "RAG pipelines that trigger writes or emails — add execution checks on pipeline tool steps.", publishedAt: date, tags: ["haystack","rag","acquisition"], readTime: 5 },
  { slug: 'mcp-registry-third-party-server-trust', title: "MCP registry and third-party server trust", description: "Installing community MCP servers? Treat them like supply chain — schema + pre-execution policy.", publishedAt: date, tags: ["mcp","supply-chain","security","acquisition"], readTime: 7 },
  { slug: 'agent2agent-protocol-trust-boundaries', title: "Agent2Agent protocol trust boundaries", description: "Cross-vendor agent messaging needs delegation limits and verify-before-forward for side effects.", publishedAt: date, tags: ["a2a","protocol","multi-agent","acquisition"], readTime: 6 },
  { slug: 'connect-agent-openai-claude-gemini-unified', title: "Sanctum Connect: one gate for OpenAI, Claude, and Gemini agents", description: "Connect Agent proxies tool calls with verify — one console for multi-provider fleets.", publishedAt: date, tags: ["connect","multi-model","get-started","acquisition"], readTime: 6, featured: true },
  { slug: 'ai-agent-safety-pilot-for-startups', title: "AI agent safety pilot for startup teams", description: "Protect one real agent action, show runtime approval, and turn safety into customer trust before launch.", publishedAt: date, tags: ["founder","startup","get-started","acquisition"], readTime: 6, featured: true },
  { slug: 'founder-guide-runtime-trust-before-launch', title: "Founder guide: runtime trust before your agent launch", description: "Pre-launch checklist: three actions gated, mobile approve tested, audit export saved for investors.", publishedAt: date, tags: ["founder","startup","checklist","acquisition"], readTime: 5 },
  { slug: 'indie-hacker-ai-saas-agent-gates-weekend', title: "Indie hacker AI SaaS: agent gates in one weekend", description: "Solo founders can gate send_email and stripe charges Saturday — ship Sunday with confidence.", publishedAt: date, tags: ["indie-hacker","startup","get-started","acquisition"], readTime: 5 },
  { slug: 'product-hunt-launch-agentic-ai-safely', title: "Product Hunt launch: ship agentic AI safely", description: "Hunters ask about safety — show live approve/block in demo and link your trust center.", publishedAt: date, tags: ["product-hunt","launch","marketing","acquisition"], readTime: 5 },
  { slug: 'hackernews-ai-agent-security-what-to-build', title: "Hacker News AI agent security: what builders actually need", description: "HN threads converge on execution proof — open-core runtime + console beats another governance PDF.", publishedAt: date, tags: ["hackernews","developer","open-core","acquisition"], readTime: 6 },
  { slug: 'github-stars-to-production-agent-controls', title: "From GitHub stars to production agent controls", description: "OSS traction means scrutiny — add runtime trust before enterprise pilots ask for your SOC packet.", publishedAt: date, tags: ["github","open-core","enterprise","acquisition"], readTime: 5 },
  { slug: 'startup-seo-ai-agent-security-keywords', title: "Startup SEO: AI agent security keywords that convert", description: "Long-tail queries on approval, MCP, and kill switch — content map for agent teams ready to deploy.", publishedAt: date, tags: ["seo","startup","marketing","acquisition"], readTime: 6 },
  { slug: 'free-console-ai-agent-approval-no-sales-call', title: "Free console: AI agent approval with no sales call", description: "Sign in, gate one action, export audit — frictionless path for technical buyers from search and social.", publishedAt: date, tags: ["sign-up","get-started","console","acquisition"], readTime: 4, featured: true },
  { slug: 'invite-team-ai-agent-console-onboarding', title: "Invite your team: AI agent console onboarding in 15 minutes", description: "Second user is often security or ops — shared Shield Rules and Fleet pause without custom RBAC build.", publishedAt: date, tags: ["team","onboarding","console","acquisition"], readTime: 5 },
  { slug: 'yc-batch-agent-security-one-pager', title: "YC batch agent security one-pager for investors", description: "What to show partners: policy version, held actions, fleet pause — evidence in one export.", publishedAt: date, tags: ["yc","startup","compliance","acquisition"], readTime: 5 },
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
    `${post.description} If you found this via ${channel}, you likely need software this week — not another strategy deck. Sanctum Runtime combines an MIT SDK with a hosted console for execution-time approve, verify, and block.`,
    [
      `Discovery channel: ${channel} — intent is deploy or compare, not casual reading.`,
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
'google-agent-gateway-mcp-security-2026': acq(
    'google-agent-gateway-mcp-security-2026',
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
  ),
'people-also-ask-ai-agent-approval-software': acq(
    'people-also-ask-ai-agent-approval-software',
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
  ),
'cursor-ai-agent-production-guardrails': acq(
    'cursor-ai-agent-production-guardrails',
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
  ),
'ai-agent-security-after-headline-incidents-2026': acq(
    'ai-agent-security-after-headline-incidents-2026',
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
  ),
'connect-agent-openai-claude-gemini-unified': acq(
    'connect-agent-openai-claude-gemini-unified',
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
  ),
'ai-agent-safety-pilot-for-startups': acq(
    'ai-agent-safety-pilot-for-startups',
    'Teams discover Sanctum when they need to prove one real agent action is controlled before launch.',
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
  ),
'free-console-ai-agent-approval-no-sales-call': acq(
    'free-console-ai-agent-approval-no-sales-call',
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
  ),
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
