import { getBlogPost } from '@/lib/blog-posts'
import { type ConsolePageId, consolePageLabel } from '@/lib/console-pages'

export type BlogConsoleCta = {
  /** One-line value prop for this article */
  headline: string
  /** Primary console destination */
  primaryPage: ConsolePageId
  /** Optional second page (review, evidence, etc.) */
  secondaryPage?: ConsolePageId
  /** Action name shown in steps when relevant */
  action?: string
  steps: string[]
}

type Rule = {
  test: (slug: string, tags: string[]) => boolean
  cta: (slug: string) => BlogConsoleCta
}

function steps(
  primary: ConsolePageId,
  secondary: ConsolePageId | undefined,
  lines: [string, string, string, string?],
): string[] {
  const p = consolePageLabel(primary)
  const s = secondary ? consolePageLabel(secondary) : null
  return lines
    .filter((line): line is string => Boolean(line))
    .map((line) =>
      line
        .replace(/\{primary\}/g, p)
        .replace(/\{secondary\}/g, s ?? 'Runtime Activity'),
    )
}

function slugHas(slug: string, ...parts: string[]) {
  return parts.some((p) => slug.includes(p))
}

function tagHas(tags: string[], ...parts: string[]) {
  return parts.some((p) => tags.includes(p))
}

const RULES: Rule[] = [
  {
    test: (slug, tags) =>
      tagHas(tags, 'transactional') ||
      slugHas(slug, 'get-started', 'sign-up', 'free-trial', 'buyers', 'rfp', 'pilot', 'weekend', 'minutes', 'sign-up'),
    cta: () => ({
      headline: 'Start in the console now — connect an agent and gate your first action today.',
      primaryPage: 'agents',
      secondaryPage: 'shield-rules',
      steps: steps('agents', 'shield-rules', [
        'Sign in at **{primary}** and click **Create agent** — copy the SDK snippet into your repo.',
        'In **{secondary}**, add your riskiest action (e.g. `send_email`) → **Verify**.',
        'Trigger the action once from dev or staging.',
        'Open **Overview** and approve or deny — you are live.',
      ]),
    }),
  },
  {
    test: (slug) => slug === 'how-to-stop-ai-agents-from-sending-emails-without-approval',
    cta: () => ({
      headline: 'Hold outbound email until an operator approves it.',
      primaryPage: 'shield-rules',
      secondaryPage: 'activity',
      action: 'send_email',
      steps: steps('shield-rules', 'activity', [
        'Open **{primary}** in the sidebar.',
        'Add a rule for `send_email` and set the response to **Verify**.',
        'In **Agents**, connect your runtime and call `verifyAction` before any send runs.',
        'When a message is held, approve or deny it from **{secondary}** (or the Overview queue).',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'kill-switch', 'stop-button', 'incident', 'hacked') ||
      tagHas(tags, 'incident-response', 'kill-switch'),
    cta: () => ({
      headline: 'Pause every agent in one place, then investigate with full context.',
      primaryPage: 'fleet',
      secondaryPage: 'audit',
      steps: steps('fleet', 'audit', [
        'Open **{primary}** and use **Pause fleet** to block new side effects org-wide.',
        'Confirm agents show paused status before you change anything else.',
        'Open **{secondary}** and filter recent **Verify** / **Blocked** events for the incident window.',
        'When safe, resume the fleet and tighten rules in **Shield Rules**.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'mobile', 'pwa', 'approve-ai-agent-actions-on-mobile') ||
      tagHas(tags, 'pwa', 'mobile'),
    cta: () => ({
      headline: 'Review and resolve risky actions from your phone like a normal approval app.',
      primaryPage: 'overview',
      secondaryPage: 'alerts',
      action: 'verify',
      steps: steps('overview', 'alerts', [
        'Sign in to the console and open **{primary}** — this is your live review queue.',
        'Install the PWA from the banner (or browser menu) for home-screen access.',
        'In **{secondary}**, enable push notifications for verification requests.',
        'Tap a pending action, review context, then approve once or deny.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'soc2', 'compliance', 'audit', 'dispute', 'chargeback', 'legal', 'accountability') ||
      tagHas(tags, 'compliance', 'soc2', 'audit-log'),
    cta: () => ({
      headline: 'Export defensible evidence: policy version, decision, approver, and execution proof.',
      primaryPage: 'compliance',
      secondaryPage: 'audit',
      steps: steps('compliance', 'audit', [
        'Open **{primary}** for control mappings and export-oriented views.',
        'In **{secondary}**, locate the action by correlation ID or time range.',
        'Open the event drawer to see policy path, risk score, and verification outcome.',
        'Use **Policy History** when auditors ask what rule was active on that date.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'payment', 'commerce', 'wallet', 'credit-card', 'trading', 'fraud', 'chargeback') ||
      tagHas(tags, 'payments', 'agentic-commerce', 'fraud', 'wallets'),
    cta: () => ({
      headline: 'Let low-risk purchases flow; hold the rest for human review before money moves.',
      primaryPage: 'shield-rules',
      secondaryPage: 'policies',
      action: 'transfer_funds',
      steps: steps('shield-rules', 'policies', [
        'Open **{primary}** and add a rule for `transfer_funds` or `place_order` → **Verify**.',
        'Optional: set a **min amount** so small purchases auto-approve.',
        'In **{secondary}**, set the same actions to **Verify** for your default policy map.',
        'Review held payments from **Overview** or **Runtime Activity** before they execute.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'robot', 'embodied', 'humanoid', 'ros2', 'delivery', 'sidewalk', 'fleet') ||
      tagHas(tags, 'robotics', 'embodied-ai', 'humanoids', 'ros2'),
    cta: () => ({
      headline: 'Gate physical actions before motors run — with fleet pause when something looks wrong.',
      primaryPage: 'shield-rules',
      secondaryPage: 'fleet',
      action: 'move_robot',
      steps: steps('shield-rules', 'fleet', [
        'In **{primary}**, require **Verify** for `move_robot`, `unlock_door`, or your robot action names.',
        'Mark high-risk patterns (e.g. `emergency_*`) as **Block** unless explicitly tested.',
        'Use **{secondary}** to pause the whole fleet during weather or safety incidents.',
        'After incidents, replay decisions in **Audit Logs** and adjust rules.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'mcp', 'tool-argument', 'tool-calling') || tagHas(tags, 'mcp', 'tool-use'),
    cta: () => ({
      headline: 'Treat every MCP tool call as untrusted until policy and operators say otherwise.',
      primaryPage: 'agents',
      secondaryPage: 'shield-rules',
      steps: steps('agents', 'shield-rules', [
        'Open **{primary}** and register the agent that calls your MCP server.',
        'Copy the connect snippet so `verifyAction` runs before tools execute.',
        'In **{secondary}**, add rules for sensitive tools (files, payments, messaging) → **Verify**.',
        'Watch first live calls in **Runtime Activity** and tune patterns from real traffic.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'prompt-injection', 'exfiltration', 'confused-deputy', 'threat') ||
      tagHas(tags, 'prompt-injection', 'llm-security', 'data-security'),
    cta: () => ({
      headline: 'Catch injection and exfil chains at execution time, not only in chat filters.',
      primaryPage: 'shield',
      secondaryPage: 'shield-rules',
      steps: steps('shield', 'shield-rules', [
        'Open **{primary}** to see built-in signals (injection, financial, physical harm).',
        'In **{secondary}**, add **Verify** or **Block** for `access_database`, `send_email`, and export-like actions.',
        'Use **Policies** to set source-trust-aware defaults for tool output actions.',
        'Investigate spikes in **Threat Monitor** before loosening rules.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'policy', 'governance', 'risk-management', 'rbac', 'scale') ||
      tagHas(tags, 'policy-engine', 'ai-governance'),
    cta: () => ({
      headline: 'Start small: a clear action map, versioned rules, and replay before wide rollout.',
      primaryPage: 'policies',
      secondaryPage: 'policy-history',
      steps: steps('policies', 'policy-history', [
        'Open **{primary}** and set **Verify** on irreversible actions first.',
        'Use **Simulate** on a recent action to see approve / verify / block outcomes.',
        'Publish changes, then check **{secondary}** for the version timestamp.',
        'Replay a past incident in **Audit Logs** after each policy update.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'workflow', 'crm', 'slack', 'automation') || tagHas(tags, 'workflow', 'automation'),
    cta: () => ({
      headline: 'Keep automations fast while verifying CRM posts, Slack messages, and script runs.',
      primaryPage: 'workflow-builder',
      secondaryPage: 'policies',
      action: 'run_workflow',
      steps: steps('workflow-builder', 'policies', [
        'Open **{primary}** to map steps that should call `verifyAction`.',
        'In **{secondary}**, set `post_slack`, `update_crm`, and `run_workflow` to **Verify**.',
        'Route high-impact branches to human review in **Overview**.',
        'Use **Audit Logs** to prove what ran during customer-facing incidents.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'healthcare', 'phi', 'triage') || tagHas(tags, 'healthcare'),
    cta: () => ({
      headline: 'Apply HIPAA-aware packs and require verification before patient-impacting actions.',
      primaryPage: 'marketplace',
      secondaryPage: 'shield-rules',
      action: 'dispense',
      steps: steps('marketplace', 'shield-rules', [
        'Open **{primary}** and install a healthcare / PHI policy pack if available.',
        'In **{secondary}**, set **Verify** on `dispense`, `move_bed`, and record-access actions.',
        'Assign dual approval for life-critical actions in the verification modal when prompted.',
        'Export evidence from **Compliance** for access reviews.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'offline', 'ollama', 'degraded', 'outage', 'compute', 'gpu', 'scarcity') ||
      tagHas(tags, 'offline', 'ollama', 'outages'),
    cta: () => ({
      headline: 'Keep deterministic policy when models or cloud scoring are unavailable.',
      primaryPage: 'settings',
      secondaryPage: 'policies',
      steps: steps('settings', 'policies', [
        'Open **{primary}** and confirm API URL, keys, and risk model status.',
        'In **{secondary}**, set safe defaults: high-impact actions → **Block** or **Verify** offline.',
        'Test disconnect behavior with a staged agent in **Agents**.',
        'Review offline decisions later in **Audit Logs**.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'observability', 'guardrail') || tagHas(tags, 'observability', 'guardrails'),
    cta: () => ({
      headline: 'Pair visibility with enforcement — see every attempt and stop the risky ones early.',
      primaryPage: 'activity',
      secondaryPage: 'shield-rules',
      steps: steps('activity', 'shield-rules', [
        'Open **{primary}** to watch live approve / verify / block decisions.',
        'Click any row for full context, policy path, and risk breakdown.',
        'Add missing controls in **{secondary}** when you see repeat near-misses.',
        'Use **Sanctum Shield** for model-agnostic threat signals on top of your rules.',
      ]),
    }),
  },
  {
    test: (slug, tags) =>
      slugHas(slug, 'approval', 'hitl', 'human-in-the-loop', 'timeout', 'consent', 'dual-approval', 'escalation') ||
      tagHas(tags, 'human-in-the-loop', 'verification'),
    cta: () => ({
      headline: 'Make human review real: pause execution, show context, and log every decision.',
      primaryPage: 'overview',
      secondaryPage: 'shield-rules',
      steps: steps('overview', 'shield-rules', [
        'Open **{primary}** — pending verifications appear at the top.',
        'In **{secondary}**, set sensitive actions to **Verify** (not auto-approve on timeout).',
        'Use **Alerts** for SLA reminders and backup approvers.',
        'Confirm outcomes in **Runtime Activity** for audit trails.',
      ]),
    }),
  },
  {
    test: (slug, tags) => tagHas(tags, 'langchain', 'sdk') || slugHas(slug, 'langchain', 'middleware', 'signed-action'),
    cta: () => ({
      headline: 'Wire verification once in middleware, then manage rules without redeploying agents.',
      primaryPage: 'agents',
      secondaryPage: 'policies',
      steps: steps('agents', 'policies', [
        'Open **{primary}**, create an agent, and copy the SDK connect snippet.',
        'Wrap tool calls with `verifyAction` (or your framework adapter).',
        'Tune defaults in **{policies}** per action name.',
        'Validate signed tokens on executors before side effects (see docs).',
      ]),
    }),
  },
]

const DEFAULT_CTA = (slug: string): BlogConsoleCta => {
  const post = getBlogPost(slug)
  const action =
    slug.includes('email') ? 'send_email'
    : slug.includes('door') || slug.includes('unlock') ? 'unlock_door'
    : 'your_action'

  return {
    headline: post
      ? `Apply "${post.title.split(':')[0]}" with runtime gates before side effects run.`
      : 'Gate agent actions before they execute in production.',
    primaryPage: 'shield-rules',
    secondaryPage: 'activity',
    action,
    steps: steps('shield-rules', 'activity', [
      'Open **{primary}** in the sidebar.',
      `Add a rule for \`${action}\` → **Verify** (or **Block** while testing).`,
      'Connect your agent under **Agents** with `verifyAction` before execute.',
      'Approve or deny held actions from **{secondary}**.',
    ]),
  }
}

export function getBlogConsoleCta(slug: string): BlogConsoleCta {
  const post = getBlogPost(slug)
  const tags = post?.tags ?? []

  for (const rule of RULES) {
    if (rule.test(slug, tags)) return rule.cta(slug)
  }

  return DEFAULT_CTA(slug)
}
