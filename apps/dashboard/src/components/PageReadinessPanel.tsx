import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  CreditCard,
  Eye,
  FileCheck,
  GitBranch,
  KeyRound,
  Package,
  Plug,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import type { PageId } from '../layout/Sidebar'

type ReadinessTone = 'ok' | 'warn' | 'danger'

type ReadinessConfig = {
  eyebrow: string
  title: string
  proof: string
  outcomes: string[]
  cta?: { label: string; page: PageId }
  secondary?: { label: string; page: PageId }
  icon: typeof ShieldCheck
}

export type ReadinessMetrics = {
  apiError?: string | null
  auditCount?: number
  connectHeldCount?: number
  fleetPaused?: boolean
  pendingReviewCount?: number
  policyCount?: number
  runtimeStatus?: RuntimeStatus | null
}

type ReadinessVerdict = {
  label: string
  tone: ReadinessTone
}

const PAGE_READINESS: Record<PageId, ReadinessConfig> = {
  overview: {
    eyebrow: '10/10 cockpit',
    title: 'One screen for runtime trust, held actions, and next best action.',
    proof: 'The operator can see whether autonomy is safe, paused, blocked, or waiting for review.',
    outcomes: ['live status', 'held queue', 'threat posture'],
    cta: { label: 'Open Live Feed', page: 'live-feed' },
    secondary: { label: 'Connect Agent', page: 'connect' },
    icon: BadgeCheck,
  },
  connect: {
    eyebrow: '10/10 connect',
    title: 'Prove Sanctum sits between model intent and real-world execution.',
    proof: 'A tool call should appear in Live Feed, receive policy/Shield judgment, and require approval or an action token before execution.',
    outcomes: ['proxy gate', 'execution token', 'provider-neutral'],
    cta: { label: 'Run from Live Feed', page: 'live-feed' },
    secondary: { label: 'Replay impact', page: 'assurance' },
    icon: Plug,
  },
  'live-feed': {
    eyebrow: '10/10 decision center',
    title: 'Turn every tool call into an explainable operator decision.',
    proof: 'Rows show actor, platform, tool, blast radius, source trust, and the exact control to hold, block, or approve.',
    outcomes: ['inline decisions', 'policy from event', 'causal context'],
    cta: { label: 'Review held queue', page: 'live-feed' },
    secondary: { label: 'Replay policies', page: 'assurance' },
    icon: Eye,
  },
  activity: {
    eyebrow: '10/10 observability',
    title: 'Show the timeline of autonomy, not just logs.',
    proof: 'Activity explains what happened, when it happened, and which controls changed the result.',
    outcomes: ['timeline', 'usage', 'operator trace'],
    cta: { label: 'Open Audit Logs', page: 'audit' },
    secondary: { label: 'Open Live Feed', page: 'live-feed' },
    icon: Activity,
  },
  audit: {
    eyebrow: '10/10 audit',
    title: 'Every decision should be defensible after the fact.',
    proof: 'Audit records preserve actor, action, policy, reasoning, approval provenance, and chain integrity.',
    outcomes: ['chain integrity', 'evidence', 'receipts'],
    cta: { label: 'Generate evidence', page: 'assurance' },
    secondary: { label: 'Policy History', page: 'policy-history' },
    icon: ScrollText,
  },
  threats: {
    eyebrow: '10/10 threat monitor',
    title: 'Explain risky behavior before it spreads.',
    proof: 'Threat views should connect anomaly signals to blocked actions, held approvals, and containment options.',
    outcomes: ['early warning', 'behavioral signals', 'containment'],
    cta: { label: 'Open Shield', page: 'shield' },
    secondary: { label: 'Live Feed', page: 'live-feed' },
    icon: ShieldCheck,
  },
  shield: {
    eyebrow: '10/10 Shield',
    title: 'Contain dangerous autonomy without waiting for humans to notice.',
    proof: 'Shield combines risk signals, hard blocks, fleet pause, and operator alerts into one defensive layer.',
    outcomes: ['kill switch', 'auto-block', 'alerts'],
    cta: { label: 'Tune Shield Rules', page: 'shield-rules' },
    secondary: { label: 'Threat Monitor', page: 'threats' },
    icon: ShieldCheck,
  },
  'shield-rules': {
    eyebrow: '10/10 rules',
    title: 'Make safety policy readable, testable, and enforceable.',
    proof: 'Rules should clearly say what gets blocked, what gets held, and when the fleet pauses.',
    outcomes: ['block rules', 'hold rules', 'recovery'],
    cta: { label: 'Replay impact', page: 'assurance' },
    secondary: { label: 'Policies', page: 'policies' },
    icon: ShieldCheck,
  },
  alerts: {
    eyebrow: '10/10 alerts',
    title: 'Notify the right operator before the action becomes damage.',
    proof: 'Alerts should map to delivery channels, severity, source action, and the next mitigation step.',
    outcomes: ['push/email', 'routing', 'resolution'],
    cta: { label: 'Notification settings', page: 'settings' },
    secondary: { label: 'Live Feed', page: 'live-feed' },
    icon: Bell,
  },
  policies: {
    eyebrow: '10/10 policies',
    title: 'Move from static rules to runtime permission design.',
    proof: 'Policies should be easy to author, simulate, replay, and promote safely.',
    outcomes: ['simulate', 'conditions', 'rollout'],
    cta: { label: 'Compose policy', page: 'workflow-builder' },
    secondary: { label: 'Replay impact', page: 'assurance' },
    icon: GitBranch,
  },
  'policy-history': {
    eyebrow: '10/10 change control',
    title: 'Every policy change should explain why behavior changed.',
    proof: 'History gives teams a clean trail for rollback, compliance, and regression review.',
    outcomes: ['diffs', 'rollback', 'audit'],
    cta: { label: 'Replay impact', page: 'assurance' },
    secondary: { label: 'Policies', page: 'policies' },
    icon: ScrollText,
  },
  'workflow-builder': {
    eyebrow: '10/10 composer',
    title: 'Let operators build policy without becoming YAML experts.',
    proof: 'The composer should produce safe rules, readable YAML, and a simulator result before saving.',
    outcomes: ['visual policy', 'simulation', 'YAML'],
    cta: { label: 'Open Policies', page: 'policies' },
    secondary: { label: 'Replay impact', page: 'assurance' },
    icon: GitBranch,
  },
  governance: {
    eyebrow: '10/10 governance',
    title: 'Make approval ownership explicit before high-impact actions run.',
    proof: 'Governance should show who can approve, escalation windows, and why a second approver is required.',
    outcomes: ['approval chain', 'ownership', 'escalation'],
    cta: { label: 'Permission graph', page: 'permissions' },
    secondary: { label: 'Live Feed', page: 'live-feed' },
    icon: KeyRound,
  },
  permissions: {
    eyebrow: '10/10 permissions',
    title: 'Show which identities can turn intent into action.',
    proof: 'A graph view makes actors, tools, runtimes, scopes, and expiry visible before policy drift happens.',
    outcomes: ['identity graph', 'scope', 'expiry'],
    cta: { label: 'Governance', page: 'governance' },
    secondary: { label: 'Agents', page: 'agents' },
    icon: KeyRound,
  },
  assurance: {
    eyebrow: '10/10 assurance',
    title: 'Replay yesterday before you change tomorrow.',
    proof: 'Policy replay, signed token verification, and evidence exports turn control into proof.',
    outcomes: ['replay', 'evidence', 'token verify'],
    cta: { label: 'Open Audit Logs', page: 'audit' },
    secondary: { label: 'Compliance', page: 'compliance' },
    icon: FileCheck,
  },
  compliance: {
    eyebrow: '10/10 compliance',
    title: 'Package runtime decisions into audit-ready evidence.',
    proof: 'Compliance should answer who approved, what was blocked, what policy changed, and what evidence exists.',
    outcomes: ['SOC 2', 'NIST AI RMF', 'exports'],
    cta: { label: 'Generate evidence', page: 'assurance' },
    secondary: { label: 'Audit Logs', page: 'audit' },
    icon: FileCheck,
  },
  agents: {
    eyebrow: '10/10 agents',
    title: 'Treat every agent as an accountable runtime identity.',
    proof: 'Agent records should make tokens, tool behavior, ownership, and revocation obvious.',
    outcomes: ['identity', 'token', 'revocation'],
    cta: { label: 'Connect Agent', page: 'connect' },
    secondary: { label: 'Devices', page: 'devices' },
    icon: Plug,
  },
  devices: {
    eyebrow: '10/10 devices',
    title: 'Keys and devices should be boring, scoped, and revocable.',
    proof: 'Operators need clear token purpose, rotation, last use, and immediate revoke paths.',
    outcomes: ['API keys', 'rotation', 'revocation'],
    cta: { label: 'Agents', page: 'agents' },
    secondary: { label: 'Settings', page: 'settings' },
    icon: KeyRound,
  },
  fleet: {
    eyebrow: '10/10 fleet',
    title: 'Show runtime topology and give operators one decisive pause control.',
    proof: 'Fleet health should combine region, runtime status, attestation, trust, and kill switch state.',
    outcomes: ['attestation', 'regions', 'pause fleet'],
    cta: { label: 'Devices', page: 'devices' },
    secondary: { label: 'Threat Monitor', page: 'threats' },
    icon: Radio,
  },
  marketplace: {
    eyebrow: '10/10 marketplace',
    title: 'Turn domain expertise into installable policy packs.',
    proof: 'Verified packs should give teams a safe baseline for MCP, payments, healthcare, robotics, and smart home.',
    outcomes: ['verified packs', 'domain baselines', 'install/uninstall'],
    cta: { label: 'Replay impact', page: 'assurance' },
    secondary: { label: 'Policies', page: 'policies' },
    icon: Package,
  },
  billing: {
    eyebrow: '10/10 billing',
    title: 'Bill curiosity lightly and control clearly.',
    proof: 'Plans should make observe free, governed actions explicit, and upgrade moments contextual.',
    outcomes: ['observe free', 'governed quota', 'upgrade moments'],
    cta: { label: 'Connect Agent', page: 'connect' },
    secondary: { label: 'Live Feed', page: 'live-feed' },
    icon: CreditCard,
  },
  settings: {
    eyebrow: '10/10 settings',
    title: 'Make production posture visible without leaking implementation detail.',
    proof: 'Settings should cover profile, push readiness, domains, security, and support paths in one calm place.',
    outcomes: ['push readiness', 'domains', 'security'],
    cta: { label: 'Alerts', page: 'alerts' },
    secondary: { label: 'Billing', page: 'billing' },
    icon: Sparkles,
  },
}

type Props = {
  page: PageId
  metrics?: ReadinessMetrics
  onPage: (page: PageId) => void
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard' }).format(value)
}

function runtimeVerdict(status: RuntimeStatus | null | undefined): ReadinessVerdict {
  if (status === null || status === undefined) return { label: 'Checking runtime', tone: 'warn' }
  if (status.runtimeOnline) return { label: 'Runtime online', tone: 'ok' }
  return { label: 'Runtime offline', tone: 'danger' }
}

function buildLiveConfig(page: PageId, base: ReadinessConfig, metrics: ReadinessMetrics = {}): ReadinessConfig & { verdict: ReadinessVerdict } {
  const pending = metrics.pendingReviewCount ?? 0
  const connectHeld = metrics.connectHeldCount ?? 0
  const auditCount = metrics.auditCount ?? 0
  const policyCount = metrics.policyCount ?? 0
  const runtime = runtimeVerdict(metrics.runtimeStatus)
  const hasApiError = Boolean(metrics.apiError)
  const fleetPaused = Boolean(metrics.fleetPaused)

  if (hasApiError) {
    return {
      ...base,
      eyebrow: 'Needs attention',
      title: 'The control plane can see the page, but the API needs recovery.',
      proof: 'Keep the operator in place, then restore API reachability before trusting live decisions.',
      outcomes: ['api unreachable', 'cached view', 'retry ready'],
      cta: { label: 'Open Settings', page: 'settings' },
      secondary: { label: 'Runtime Fleet', page: 'fleet' },
      verdict: { label: 'API attention', tone: 'danger' },
    }
  }

  if (fleetPaused) {
    return {
      ...base,
      eyebrow: 'Containment active',
      title: 'The fleet is paused, so agent approvals are intentionally suspended.',
      proof: 'This is the right state during incident review. Resume only after reviewing held actions and fleet health.',
      outcomes: ['fleet paused', 'approvals suspended', 'incident mode'],
      cta: { label: 'Open Fleet', page: 'fleet' },
      secondary: { label: 'Review queue', page: 'live-feed' },
      verdict: { label: 'Fleet paused', tone: 'warn' },
    }
  }

  if ((page === 'overview' || page === 'live-feed') && pending > 0) {
    return {
      ...base,
      eyebrow: 'Live queue',
      title: `${compactNumber(pending)} action${pending === 1 ? '' : 's'} need an operator decision.`,
      proof: 'Review the queue one at a time so approvals stay intentional and auditable.',
      outcomes: ['held actions', 'operator decision', 'audit trail'],
      cta: { label: 'Review held queue', page: 'live-feed' },
      secondary: { label: 'Replay impact', page: 'assurance' },
      verdict: { label: `${compactNumber(pending)} held`, tone: 'warn' },
    }
  }

  if (page === 'connect' && connectHeld > 0) {
    return {
      ...base,
      eyebrow: 'Connect proving value',
      title: `${compactNumber(connectHeld)} Connect tool call${connectHeld === 1 ? '' : 's'} are held for review.`,
      proof: 'The proxy is no longer just observing. It is intercepting side effects before local execution.',
      outcomes: ['proxy active', 'held tools', 'operator gate'],
      cta: { label: 'Open Live Feed', page: 'live-feed' },
      secondary: { label: 'Tune policies', page: 'policies' },
      verdict: { label: 'Gate working', tone: 'ok' },
    }
  }

  if (page === 'overview') {
    return {
      ...base,
      proof: `${runtime.label}. ${compactNumber(auditCount)} event${auditCount === 1 ? '' : 's'} loaded and ${compactNumber(policyCount)} polic${policyCount === 1 ? 'y' : 'ies'} ready.`,
      outcomes: [runtime.label.toLowerCase(), `${compactNumber(policyCount)} policies`, `${compactNumber(auditCount)} events`],
      verdict: runtime,
    }
  }

  if (page === 'policies' || page === 'workflow-builder' || page === 'policy-history') {
    return {
      ...base,
      proof: `${compactNumber(policyCount)} polic${policyCount === 1 ? 'y is' : 'ies are'} loaded. Simulate or replay before promoting behavior into production.`,
      outcomes: [`${compactNumber(policyCount)} policies`, 'simulation', 'safe rollout'],
      verdict: { label: policyCount > 0 ? 'Policy ready' : 'Add policy', tone: policyCount > 0 ? 'ok' : 'warn' },
    }
  }

  if (page === 'audit' || page === 'activity' || page === 'assurance' || page === 'compliance') {
    return {
      ...base,
      proof: `${compactNumber(auditCount)} decision event${auditCount === 1 ? '' : 's'} are available for timeline review, replay, and evidence packaging.`,
      outcomes: [`${compactNumber(auditCount)} events`, 'replayable', 'export-ready'],
      verdict: { label: auditCount > 0 ? 'Evidence ready' : 'Waiting for events', tone: auditCount > 0 ? 'ok' : 'warn' },
    }
  }

  return {
    ...base,
    verdict: { label: 'Ready', tone: 'ok' },
  }
}

export function PageReadinessPanel({ page, metrics, onPage }: Props) {
  const cfg = PAGE_READINESS[page]
  if (!cfg) return null
  const live = buildLiveConfig(page, cfg, metrics)
  const Icon = live.icon

  return (
    <section className={`readiness-panel readiness-panel--${live.verdict.tone}`} aria-label="Production readiness">
      <div className="readiness-panel__icon" aria-hidden>
        <Icon size={18} />
      </div>
      <div className="readiness-panel__body">
        <span className="readiness-panel__eyebrow">{live.eyebrow}</span>
        <strong>{live.title}</strong>
        <p>{live.proof}</p>
        <div className="readiness-panel__outcomes" aria-label="Readiness outcomes">
          {live.outcomes.map((outcome) => (
            <span key={outcome}>{outcome}</span>
          ))}
        </div>
      </div>
      <span className={`readiness-panel__verdict readiness-panel__verdict--${live.verdict.tone}`}>
        {live.verdict.label}
      </span>
      <div className="readiness-panel__actions">
        {live.cta && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPage(live.cta!.page)}>
            {live.cta.label}
            <ArrowRight size={13} aria-hidden />
          </button>
        )}
        {live.secondary && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage(live.secondary!.page)}>
            {live.secondary.label}
          </button>
        )}
      </div>
    </section>
  )
}
