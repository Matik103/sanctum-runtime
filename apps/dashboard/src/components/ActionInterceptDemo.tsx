import { useMemo, useState } from 'react'
import { ArrowRight, BadgeCheck, Coins, DatabaseZap, DoorOpen, Loader2, MailWarning, ShieldCheck } from 'lucide-react'
import type { SimulateResult } from '../lib/api'
import { simulateAction } from '../lib/api'
import type { PageId } from '../layout/Sidebar'
import { decisionLabel } from '../lib/labels'
import { decisionTone } from '../lib/format'

type Scenario = {
  id: string
  label: string
  icon: typeof Coins
  actor: string
  action: string
  context: Record<string, unknown>
}

const scenarios: Scenario[] = [
  {
    id: 'money',
    label: 'Wire funds from email',
    icon: Coins,
    actor: 'agent:finance-copilot',
    action: 'transfer_funds',
    context: {
      amount: 12500,
      currency: 'USD',
      destination: 'external:vendor-wire',
      instructionSource: 'email',
      dataSensitivity: 'secret',
      reversible: false,
      toolId: 'payments.wire',
      runtimeId: 'prod-finance-agent',
      environment: 'production',
      requestedPermission: 'money.transfer',
      scope: ['bank-account:operating', 'vendor:external'],
    },
  },
  {
    id: 'data',
    label: 'Export customer list',
    icon: MailWarning,
    actor: 'agent:growth-ops',
    action: 'send_customer_export',
    context: {
      destination: 'external:marketing-vendor',
      instructionSource: 'webpage',
      dataSensitivity: 'confidential',
      externalDestination: true,
      toolId: 'email.send',
      runtimeId: 'crm-agent',
      environment: 'production',
      requestedPermission: 'customer_data.export',
      scope: ['customers:all', 'email:external'],
    },
  },
  {
    id: 'database',
    label: 'Drop production table',
    icon: DatabaseZap,
    actor: 'agent:devops',
    action: 'delete_database',
    context: {
      path: 'postgres://prod/customers',
      instructionSource: 'tool_output',
      dataSensitivity: 'regulated',
      reversible: false,
      toolId: 'postgres.query',
      runtimeId: 'prod-devops-agent',
      environment: 'production',
      requestedPermission: 'database.destroy',
      scope: ['database:prod', 'table:customers'],
    },
  },
  {
    id: 'physical',
    label: 'Unlock door at night',
    icon: DoorOpen,
    actor: 'agent:home-automation',
    action: 'unlock_front_door',
    context: {
      instructionSource: 'memory',
      physicalWorld: true,
      unusualHour: true,
      ownerSleeping: true,
      reversible: false,
      toolId: 'smart_home.lock',
      runtimeId: 'home-security-agent',
      environment: 'home',
      requestedPermission: 'door.unlock',
      scope: ['front-door', 'home:physical-access'],
    },
  },
]

function toneForBlast(level?: string) {
  if (level === 'critical' || level === 'high') return 'danger'
  if (level === 'medium') return 'warn'
  return 'neutral'
}

function sourceLabel(value?: string) {
  return value ? value.replace(/_/g, ' ') : 'unknown'
}

type Props = {
  orgId?: string | null
  onPage?: (page: PageId) => void
}

export function ActionInterceptDemo({ orgId, onPage }: Props) {
  const [activeId, setActiveId] = useState(scenarios[0].id)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0],
    [activeId],
  )
  const ActiveIcon = active.icon

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const context = orgId ? { ...active.context, org_id: orgId } : active.context
      const simulation = await simulateAction(active.actor, active.action, context)
      setResult(simulation)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card action-intercept">
      <div className="action-intercept__copy">
        <div className="card-label">Runtime trust boundary</div>
        <h2>See Sanctum stop risky AI actions before execution</h2>
        <p>
          Run a harmless simulation of a real agent action. Sanctum returns the same decision envelope used by SDK
          and Connect Agent flows: source trust, blast radius, action identity, policy path, and the execution gate.
        </p>
        <div className="action-intercept__flow" aria-label="Sanctum action control flow">
          <span>Agent proposes</span>
          <ArrowRight size={14} />
          <span>Sanctum evaluates</span>
          <ArrowRight size={14} />
          <span>Approve, block, or token</span>
        </div>
      </div>

      <div className="action-intercept__workspace">
        <div className="action-intercept__scenarios" role="tablist" aria-label="Risk scenario">
          {scenarios.map((scenario) => {
            const Icon = scenario.icon
            return (
              <button
                key={scenario.id}
                type="button"
                role="tab"
                aria-selected={activeId === scenario.id}
                className={`action-scenario ${activeId === scenario.id ? 'action-scenario--active' : ''}`}
                onClick={() => {
                  setActiveId(scenario.id)
                  setResult(null)
                  setError(null)
                }}
              >
                <Icon size={16} />
                <span>{scenario.label}</span>
              </button>
            )
          })}
        </div>

        <div className="action-intercept__request">
          <div>
            <span className="card-label">Proposed action</span>
            <strong><ActiveIcon size={17} /> {active.action}</strong>
            <p>{active.actor}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
            {running ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            Intercept action
          </button>
        </div>

        {error && <div className="alert alert--error"><div className="alert__body">{error}</div></div>}

        {result ? (
          <div className="action-intercept__result">
            <div className="action-result-main">
              <span className={`badge ${decisionTone(result.decision)}`}>{decisionLabel(result.decision)}</span>
              <strong>{result.risk} risk</strong>
              <p>{result.policyPath}</p>
            </div>
            <div className="action-passport-grid">
              <div>
                <span>Source trust</span>
                <strong>{sourceLabel(result.sourceTrust)}</strong>
              </div>
              <div>
                <span>Blast radius</span>
                <strong>
                  <span className={`badge ${toneForBlast(result.blastRadius?.level)}`}>
                    {result.blastRadius?.level ?? 'unknown'} · {result.blastRadius?.score ?? 0}/100
                  </span>
                </strong>
              </div>
              <div>
                <span>Permission</span>
                <strong>{result.actionIdentity?.requestedPermission ?? active.action}</strong>
              </div>
              <div>
                <span>Scope</span>
                <strong>{result.actionIdentity?.scope?.slice(0, 2).join(' · ') || 'action scoped'}</strong>
              </div>
            </div>
            {result.blastRadius?.factors?.length ? (
              <p className="action-intercept__factors">{result.blastRadius.factors.join(' · ')}</p>
            ) : null}
            <div className="action-intercept__next">
              <BadgeCheck size={16} />
              <span>
                In production, approved actions receive a short-lived action token; blocked or held actions never
                reach the executor without operator control.
              </span>
            </div>
          </div>
        ) : (
          <div className="action-intercept__empty">
            <ShieldCheck size={18} />
            <span>Pick a scenario and intercept it to see the trust boundary in action.</span>
          </div>
        )}

        <div className="action-intercept__links">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage?.('connect')}>
            Connect Agent
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage?.('shield')}>
            Shield
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage?.('assurance')}>
            Replay & evidence
          </button>
        </div>
      </div>
    </section>
  )
}
