import { useEffect, useState } from 'react'
import { CreditCard, Loader2, RefreshCw, Zap } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'
import { fetchOperatorContext } from '../lib/marketplace'
import {
  createCheckout,
  fetchBillingPlan,
  formatLimit,
  formatNumber,
  PLAN_ORDER,
  type BillingPlan,
  type PlanId,
} from '../lib/billing'

function UsageMeter({ label, used, limit, pct, unit = '' }: {
  label: string
  used: number
  limit: number | null
  pct: number | null
  unit?: string
}) {
  const pctVal = pct ?? 0
  const color = pctVal >= 90 ? 'var(--danger)' : pctVal >= 70 ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--muted)' }}>
          {formatNumber(used)}{unit} / {formatLimit(limit, unit)}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        {limit !== null && (
          <div style={{
            height: '100%',
            width: `${Math.min(pctVal, 100)}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }} />
        )}
        {limit === null && (
          <div style={{ height: '100%', width: '100%', background: 'var(--success)', opacity: 0.3, borderRadius: 3 }} />
        )}
      </div>
      {limit !== null && pctVal >= 80 && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.73rem', color }}>
          {pctVal >= 100 ? 'Quota reached — upgrade to continue' : `${pctVal}% used`}
        </p>
      )}
    </div>
  )
}

const PLAN_CARDS: { id: PlanId; label: string; price: string; runtimes: string; events: string; agents: string; highlight?: boolean }[] = [
  { id: 'free',       label: 'Developer',  price: 'Free',        runtimes: '3',    events: '10k/mo',  agents: '5' },
  { id: 'operator',   label: 'Operator',   price: '$49/mo',      runtimes: '25',   events: '500k/mo', agents: '10',  highlight: true },
  { id: 'team',       label: 'Team',       price: '$299/mo',     runtimes: '250',  events: '10M/mo',  agents: '50' },
  { id: 'enterprise', label: 'Enterprise', price: 'Custom',      runtimes: '∞',    events: 'Unlimited', agents: '∞' },
]

export function Billing() {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [plan, setPlan] = useState<BillingPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState<PlanId | null>(null)
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      let list = await fetchMyOrgs()
      if (list.length === 0) {
        const ctx = await fetchOperatorContext()
        if (ctx?.defaultOrganizationId) {
          list = [{ org_id: ctx.defaultOrganizationId, org_name: 'Workspace', role: 'owner' }]
        }
      }
      setOrgs(list)
      if (list[0]) setOrgId((prev) => prev || list[0].org_id)
    })()
  }, [])

  const load = async (id: string) => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setPlan(await fetchBillingPlan(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load billing info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orgId) void load(orgId)
  }, [orgId])

  const handleUpgrade = async (planId: PlanId) => {
    if (!orgId) return
    setCheckoutBusy(planId)
    setCheckoutMsg(null)
    try {
      const result = await createCheckout(orgId, planId)
      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer')
      } else {
        setCheckoutMsg(result.message ?? `Contact ${result.contactEmail ?? 'billing@sanctum.run'} for ${planId} pricing`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setCheckoutBusy(null)
    }
  }

  const currentPlanId = plan?.plan.id ?? 'free'
  const currentPlanIdx = PLAN_ORDER.indexOf(currentPlanId)

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Billing & Usage</h1>
          <p>Infrastructure-based billing — events, runtimes, and orchestration hours</p>
        </div>
        <div className="responsive-action-row">
          {orgs.length > 1 && (
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organization"
              style={{ minWidth: '10rem' }}
            >
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>{o.org_name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => void load(orgId)}
          >
            <RefreshCw size={16} className={loading ? 'spin' : undefined} />
            Refresh
          </button>
        </div>
      </header>

      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {checkoutMsg && <Alert variant="info" onDismiss={() => setCheckoutMsg(null)}>{checkoutMsg}</Alert>}

      {plan && plan.quotas.events.pct !== null && plan.quotas.events.pct >= 80 && (
        <Alert variant="warn">
          <strong>Event quota at {plan.quotas.events.pct}%</strong> —{' '}
          {plan.quotas.events.pct >= 100
            ? 'Quota reached. New events may be dropped. Upgrade your plan.'
            : `You've used ${formatNumber(plan.usage.eventsThisMonth)} of ${formatLimit(plan.limits.maxEventsPerMonth)} events this month.`}
        </Alert>
      )}
      {plan && plan.quotas.runtimes.pct !== null && plan.quotas.runtimes.pct >= 80 && (
        <Alert variant="warn">
          <strong>Runtime slots at {plan.quotas.runtimes.pct}%</strong> —{' '}
          {plan.quotas.runtimes.used} of {plan.quotas.runtimes.limit} slots used. Upgrade to connect more runtimes.
        </Alert>
      )}

      {loading && !plan ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem 0', color: 'var(--muted)' }}>
          <Loader2 size={18} className="spin" />
          <span>Loading billing info…</span>
        </div>
      ) : plan ? (
        <>
          {/* Current plan summary */}
          <section className="section" style={{ marginBottom: '1.5rem' }}>
            <div className="section__body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <CreditCard size={20} style={{ opacity: 0.6 }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current plan</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>
                    {plan.plan.name}
                    {plan.plan.priceMonthlyUsd != null && (
                      <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                        ${plan.plan.priceMonthlyUsd}/mo
                      </span>
                    )}
                    {plan.plan.priceMonthlyUsd == null && plan.plan.id !== 'free' && (
                      <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.9rem', marginLeft: '0.5rem' }}>Custom pricing</span>
                    )}
                  </p>
                </div>
              </div>

              <UsageMeter
                label="Events this month"
                used={plan.usage.eventsThisMonth}
                limit={plan.limits.maxEventsPerMonth}
                pct={plan.quotas.events.pct}
              />
              <UsageMeter
                label="Connected runtimes"
                used={plan.usage.runtimesConnected}
                limit={plan.limits.maxRuntimes}
                pct={plan.quotas.runtimes.pct}
              />
              <UsageMeter
                label="Active agents"
                used={plan.usage.agentsActive}
                limit={plan.limits.maxAgents}
                pct={plan.limits.maxAgents ? Math.round((plan.usage.agentsActive / plan.limits.maxAgents) * 100) : null}
              />
              <UsageMeter
                label="Runtime hours (30 days)"
                used={plan.usage.runtimeHoursThisMonth}
                limit={null}
                pct={null}
                unit="h"
              />

              <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Audit retention: {plan.limits.retentionDays} days
                {plan.billing.billingCycleAnchor && (
                  <> · Cycle started {new Date(plan.billing.billingCycleAnchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                )}
              </p>
            </div>
          </section>

          {/* Plan upgrade cards */}
          <section className="section">
            <div className="section__header">
              <h2><Zap size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />Plans</h2>
              <p>Scale as your fleet grows — billed per runtime activity, not per seat</p>
            </div>
            <div className="section__body">
              <div className="policy-grid">
                {PLAN_CARDS.map((pc) => {
                  const isCurrent = pc.id === currentPlanId
                  const isUpgrade = PLAN_ORDER.indexOf(pc.id) > currentPlanIdx
                  const busy = checkoutBusy === pc.id
                  return (
                    <article
                      key={pc.id}
                      className={`policy-card ${isCurrent ? 'marketplace-card--installed' : ''}`}
                      style={{ position: 'relative' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0 }}>{pc.label}</h3>
                        {isCurrent && <span className="badge success">Current</span>}
                        {pc.highlight && !isCurrent && <span className="badge warning">Popular</span>}
                      </div>
                      <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '1rem' }}>{pc.price}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                        <span>{pc.runtimes} runtimes</span>
                        <span>{pc.events} events</span>
                        <span>{pc.agents} agents</span>
                      </div>
                      {isUpgrade && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          onClick={() => void handleUpgrade(pc.id)}
                          style={{ width: '100%' }}
                        >
                          {busy ? (
                            <><Loader2 size={13} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} className="spin" />Opening checkout…</>
                          ) : pc.id === 'enterprise' ? 'Contact sales' : `Upgrade to ${pc.label}`}
                        </button>
                      )}
                      {isCurrent && (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Your active plan</p>
                      )}
                    </article>
                  )
                })}
              </div>

              <p className="hint-line" style={{ marginTop: '1.25rem' }}>
                All plans include the open-source runtime engine and policy evaluation.
                Enterprise adds air-gapped deployments, SSO, compliance exports, and SLA.
              </p>
            </div>
          </section>
        </>
      ) : (
        <p style={{ color: 'var(--muted)', padding: '2rem 0' }}>
          {orgId ? 'No billing info available.' : 'Sign in to view billing.'}
        </p>
      )}
    </>
  )
}
