import { useEffect, useState, type ReactNode } from 'react'
import { CreditCard, Eye, Loader2, LockKeyhole, RefreshCw, Zap } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { PlanGateAlert } from '../components/PlanGateAlert'
import type { FleetOrg } from '../lib/fleet'
import { resolveDefaultWorkspaceOrg } from '../lib/workspace-org'
import {
  changePlan,
  fetchBillingPlan,
  formatLimit,
  formatNumber,
  isSamePlanTier,
  normalizePlanId,
  openCustomerPortal,
  PLAN_ORDER,
  syncBillingAfterCheckout,
  type BillingPlan,
  type PlanId,
} from '../lib/billing'

function UsageMeter({ label, used, limit, pct, unit = '', hint }: {
  label: string
  used: number
  limit: number | null
  pct: number | null
  unit?: string
  hint?: string
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
      {hint && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.73rem', color: 'var(--muted)' }}>{hint}</p>
      )}
      {limit !== null && pctVal >= 80 && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.73rem', color }}>
          {pctVal >= 100 ? 'Quota reached — upgrade to continue' : `${pctVal}% used`}
        </p>
      )}
    </div>
  )
}

function BillingUsageCard({ icon, label, value, hint, tone = 'neutral' }: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'success' | 'warning'
}) {
  const borderColor = tone === 'success'
    ? 'rgba(16, 185, 129, 0.35)'
    : tone === 'warning'
      ? 'rgba(245, 158, 11, 0.35)'
      : 'var(--border)'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: '0.65rem',
        alignItems: 'start',
        minWidth: 0,
        padding: '0.8rem 0.9rem',
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        background: 'rgba(15, 23, 42, 0.42)',
      }}
    >
      <span style={{ color: tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--success)' : 'var(--muted)', paddingTop: 2 }}>
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <strong style={{ display: 'block', marginTop: '0.15rem', fontSize: '1rem', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
          {value}
        </strong>
        <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.74rem', color: 'var(--muted)', lineHeight: 1.35 }}>
          {hint}
        </span>
      </span>
    </div>
  )
}

const PLAN_CARDS: {
  id: PlanId
  label: string
  headline: string
  price: string
  promise: string
  runtimes: string
  governed: string
  observe: string
  agents: string
  retention: string
  highlight?: boolean
}[] = [
  {
    id: 'observer',
    label: 'Developer',
    headline: 'Build and observe',
    price: 'Free',
    promise: 'Connect agents and watch side effects in Live Feed. No verify, approve, block, or gate controls.',
    runtimes: '3',
    governed: 'None',
    observe: 'Unlimited',
    agents: '2',
    retention: '7 days',
  },
  {
    id: 'personal',
    label: 'Personal',
    headline: 'Remember and nudge',
    price: '$12/mo',
    promise: '30-day history, alerts, and light gates for solo builders.',
    runtimes: '5',
    governed: '500/mo',
    observe: 'Unlimited',
    agents: '5',
    retention: '30 days',
  },
  {
    id: 'operator',
    label: 'Operator',
    headline: 'Stop them before they run',
    price: '$59/mo',
    promise: 'Approve, block, and Shield production side effects.',
    runtimes: '25',
    governed: '500k/mo',
    observe: 'Unlimited',
    agents: '10',
    retention: '30 days',
    highlight: true,
  },
  {
    id: 'team',
    label: 'Team',
    headline: 'Govern the fleet',
    price: '$299/mo',
    promise: 'SSO, RBAC, compliance export, and org-wide policy.',
    runtimes: '250',
    governed: '10M/mo',
    observe: 'Unlimited',
    agents: '50',
    retention: '30 days',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    headline: 'Contractual scale',
    price: 'Custom',
    promise: 'Air-gap, private cloud, SLA, and dedicated support.',
    runtimes: 'Unlimited',
    governed: 'Unlimited',
    observe: 'Unlimited',
    agents: 'Unlimited',
    retention: '90+ days',
  },
]

export function Billing() {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [plan, setPlan] = useState<BillingPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState<PlanId | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.search)
      const urlOrg = params.get('org_id')
      const { orgId: defaultOrg, orgs: list } = await resolveDefaultWorkspaceOrg()
      setOrgs(list)
      setOrgId(urlOrg && list.some((o) => o.org_id === urlOrg) ? urlOrg : defaultOrg)
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkout = params.get('checkout')
    const urlOrg = params.get('org_id')
    if (urlOrg) setOrgId(urlOrg)
    if (checkout === 'success') {
      const checkoutId = params.get('checkout_id')
      const targetOrg = urlOrg || orgId
      params.delete('checkout')
      params.delete('checkout_id')
      params.delete('org_id')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
      if (targetOrg) {
        void (async () => {
          setCheckoutMsg('Payment received. Syncing your plan…')
          try {
            let sync = await syncBillingAfterCheckout(targetOrg, checkoutId ?? undefined)
            // Retry with backoff if webhook hasn't landed yet (up to ~15s total)
            const delays = [1500, 3000, 5000, 6000]
            for (const delay of delays) {
              if (sync.synced) break
              await new Promise((r) => setTimeout(r, delay))
              sync = await syncBillingAfterCheckout(targetOrg, checkoutId ?? undefined)
            }
            if (sync.synced && sync.planId) {
              setCheckoutMsg(`Plan updated to ${sync.planId}.`)
            } else {
              setCheckoutMsg(sync.note ?? 'Payment received. Click Refresh if your plan has not updated yet.')
            }
          } catch {
            setCheckoutMsg('Payment received. Plan updates when Creem hits the webhook — click Refresh in a few seconds.')
          }
          await load(targetOrg)
        })()
      }
    } else if (checkout === 'cancelled') {
      setCheckoutMsg('Checkout cancelled. No charge was made.')
      params.delete('checkout')
      params.delete('checkout_id')
      params.delete('org_id')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }
  }, [orgId])

  const handlePlanChange = async (planId: PlanId | 'enterprise') => {
    if (!orgId) return
    if (planId === 'enterprise') {
      setCheckoutMsg('Contact billing@sanctumruntime.com for Enterprise pricing and custom terms.')
      return
    }

    setCheckoutBusy(planId)
    setCheckoutMsg(null)
    try {
      const current = normalizePlanId(plan?.plan.id)
      if (normalizePlanId(planId) === current) {
        setCheckoutMsg(`This workspace is already on the ${PLAN_CARDS.find((p) => p.id === current)?.label ?? 'selected'} plan.`)
        return
      }
      const result = await changePlan(orgId, planId)
      if (result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank', 'noopener,noreferrer')
        setCheckoutMsg('Checkout opened in a new tab (Creem). Your plan updates after payment completes.')
      } else if (result.changed || result.upgraded) {
        setCheckoutMsg(result.message ?? `Plan updated to ${result.planId ?? planId}.`)
        await load(orgId)
      } else {
        setCheckoutMsg(
          result.message
            ?? `Contact ${result.contactEmail ?? 'billing@sanctumruntime.com'} for ${planId} pricing`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan change failed')
    } finally {
      setCheckoutBusy(null)
    }
  }

  const handleOpenPortal = async () => {
    if (!orgId) return
    setPortalBusy(true)
    setCheckoutMsg(null)
    try {
      const { portalUrl, message } = await openCustomerPortal(orgId)
      if (portalUrl) {
        window.open(portalUrl, '_blank', 'noopener,noreferrer')
        setCheckoutMsg('Creem customer portal opened in a new tab.')
      } else {
        setCheckoutMsg(message ?? 'Could not open Creem customer portal.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal')
    } finally {
      setPortalBusy(false)
    }
  }

  const currentPlanId = normalizePlanId(plan?.plan.id)
  const currentPlanIdx = Math.max(0, PLAN_ORDER.indexOf(currentPlanId))
  const userRole = orgs.find((o) => o.org_id === orgId)?.role ?? ''
  const canBill = userRole === 'owner' || userRole === 'admin'
  const governedQuota = plan?.quotas.governed ?? plan?.quotas.events
  const observeUsed = plan?.usage.observeEventsThisMonth ?? 0
  const governedUsed = plan?.usage.governedActionsThisMonth ?? plan?.usage.eventsThisMonth ?? 0
  const governedLimit =
    plan?.limits.maxGovernedActionsPerMonth ?? plan?.limits.maxEventsPerMonth ?? null
  const observeLimit = plan?.limits.maxObserveEventsPerMonth ?? null
  const observeSummary = observeLimit === null
    ? 'Not metered'
    : `${formatNumber(observeUsed)} / ${formatLimit(observeLimit)}`
  const governedSummary = governedLimit === 0
    ? 'Not included'
    : `${formatNumber(governedUsed)} / ${formatLimit(governedLimit)}`
  const governedHint = governedLimit === 0
    ? 'Developer can watch activity only. Upgrade to Personal or higher to verify, hold, approve, block, or gate actions.'
    : 'Verify, hold, approve, block, and proxy gate actions count here.'

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Billing &amp; Usage</h1>
          <p>Watch agents for free. Pay when Sanctum governs real-world actions.</p>
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

      {error && <PlanGateAlert message={error} onDismiss={() => setError(null)} />}
      {checkoutMsg && <Alert variant="info" onDismiss={() => setCheckoutMsg(null)}>{checkoutMsg}</Alert>}

      {plan && governedQuota && governedQuota.pct !== null && governedQuota.pct >= 80 && (
        <Alert variant="warn">
          <strong>Governed action quota at {governedQuota.pct}%</strong>
          {' — '}
          {governedQuota.pct >= 100
            ? 'New gated actions may be held or blocked until you upgrade.'
            : `You have used ${formatNumber(governedUsed)} of ${formatLimit(governedLimit)} governed actions this month.`}
        </Alert>
      )}

      {loading && !plan ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem 0', color: 'var(--muted)' }}>
          <Loader2 size={18} className="spin" />
          <span>Loading billing info…</span>
        </div>
      ) : plan ? (
        <>
          <section className="section" style={{ marginBottom: '1.5rem' }}>
            <div className="section__body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <CreditCard size={20} style={{ opacity: 0.6, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Current plan
                  </p>
                  <p style={{ margin: '0.15rem 0 0', fontWeight: 700, fontSize: '1.1rem' }}>
                    {plan.plan.name}
                    {plan.plan.priceMonthlyUsd != null && (
                      <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                        ${plan.plan.priceMonthlyUsd}/mo
                      </span>
                    )}
                  </p>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--muted)', maxWidth: '36rem' }}>
                    {PLAN_CARDS.find((p) => p.id === currentPlanId)?.promise}
                  </p>
                  {plan.billing.billingProvider === 'creem' && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      Subscription managed via Creem
                      {plan.billing.creemSubscriptionStatus
                        ? ` · ${plan.billing.creemSubscriptionStatus}`
                        : plan.billing.creemSubscriptionId
                          ? ' · active'
                          : ''}
                      {plan.billing.billingStatus && plan.billing.billingStatus !== 'active'
                        ? ` · billing ${plan.billing.billingStatus}`
                        : ''}
                    </p>
                  )}
                  {canBill && plan.billing.creemCustomerId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: '0.5rem' }}
                      disabled={portalBusy}
                      onClick={() => void handleOpenPortal()}
                    >
                      {portalBusy ? 'Opening portal…' : 'Manage billing in Creem'}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '1.25rem' }}>
                <BillingUsageCard
                  icon={<Eye size={16} />}
                  label="Observe"
                  value={observeSummary}
                  hint="Live Feed and audit visibility are for watching what agents touch."
                  tone="success"
                />
                <BillingUsageCard
                  icon={<LockKeyhole size={16} />}
                  label="Governed actions"
                  value={governedSummary}
                  hint={governedHint}
                  tone={governedLimit === 0 ? 'warning' : 'neutral'}
                />
              </div>

              <UsageMeter
                label="Observe events (Connect live feed)"
                used={observeUsed}
                limit={observeLimit}
                pct={plan.quotas.observe?.pct ?? null}
                hint="Watching payments, email, and tool calls does not count toward governed quota."
              />
              <UsageMeter
                label="Governed actions (verify, gate, approve)"
                used={governedUsed}
                limit={governedLimit}
                pct={governedQuota?.pct ?? null}
                hint="Blocks, holds, and proxy gates bill here — not curiosity."
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
                  <>
                    {' '}| Billing cycle started{' '}
                    {new Date(plan.billing.billingCycleAnchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </>
                )}
              </p>
            </div>
          </section>

          <section className="section">
            <div className="section__header">
              <h2>
                <Zap size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                Plans
              </h2>
              <p>We do not charge you to watch your agents. Upgrade when you need to stop or approve real-world actions.</p>
            </div>
            <div className="section__body">
              <div className="policy-grid">
                {PLAN_CARDS.map((pc) => {
                  const isCurrent = isSamePlanTier(pc.id, currentPlanId)
                    || (pc.id === 'observer' && plan?.plan.name?.toLowerCase() === 'developer')
                  const targetIdx = PLAN_ORDER.indexOf(pc.id)
                  const isUpgrade = targetIdx > currentPlanIdx
                  const isDowngrade = targetIdx < currentPlanIdx && currentPlanId !== 'observer'
                  const isCancelToObserver = pc.id === 'observer' && currentPlanId !== 'observer'
                  const isChange = isUpgrade || isDowngrade || isCancelToObserver
                  const busy = checkoutBusy === pc.id
                  const canCheckout = pc.id !== 'enterprise' && !isCurrent && isChange
                  const actionLabel = pc.id === 'observer'
                    ? 'Switch to Developer'
                    : isDowngrade
                      ? `Downgrade to ${pc.label}`
                      : `Upgrade to ${pc.label}`
                  return (
                    <article
                      key={pc.id}
                      className={`policy-card ${isCurrent ? 'marketplace-card--installed' : ''}`}
                      style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '18.5rem' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <h3 style={{ margin: 0 }}>{pc.label}</h3>
                        {isCurrent && <span className="badge success">Current</span>}
                        {pc.highlight && !isCurrent && <span className="badge warning">Popular</span>}
                      </div>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
                        {pc.headline}
                      </p>
                      <p style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '1rem' }}>{pc.price}</p>
                      <p style={{ margin: '0 0 0.65rem', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                        {pc.promise}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                        <span>{pc.agents} agents · {pc.runtimes} runtimes</span>
                        <span>{pc.observe} observe · {pc.governed} governed</span>
                        <span>{pc.retention} retention</span>
                      </div>
                      <div style={{ marginTop: 'auto' }}>
                        {canCheckout && (
                          <button
                            type="button"
                            className={`btn ${canBill ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            disabled={busy || !canBill}
                            onClick={() => void handlePlanChange(pc.id)}
                            style={{ width: '100%' }}
                          >
                            {busy ? (
                              <>
                                <Loader2 size={13} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} className="spin" />
                                {plan?.billing.creemSubscriptionId ? 'Updating plan…' : 'Opening Creem checkout…'}
                              </>
                            ) : (
                              actionLabel
                            )}
                          </button>
                        )}
                        {pc.id === 'enterprise' && !isCurrent && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ width: '100%', marginTop: canCheckout ? '0.35rem' : 0 }}
                            disabled={busy || !canBill}
                            onClick={() => void handlePlanChange('enterprise')}
                          >
                            Contact sales
                          </button>
                        )}
                        {isCurrent && (
                          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Your active plan</p>
                        )}
                        {!canBill && !isCurrent && (
                          <p style={{ margin: '0.45rem 0 0', fontSize: '0.74rem', color: 'var(--muted)' }}>
                            Ask a workspace owner or admin to change billing.
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>

              {!canBill && userRole && (
                <p style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Only workspace owners and admins can change plans. Contact your workspace owner to upgrade.
                </p>
              )}
              <p className="hint-line" style={{ marginTop: '1.25rem' }}>
                Plans are managed through secure{' '}
                <a href="https://creem.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Creem
                </a>
                {' '}checkout. Downgrades keep your current access until the end of the billing period unless your
                workspace owner changes it immediately. Enterprise adds air-gapped deployments, SSO,
                compliance exports, and SLA.
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
