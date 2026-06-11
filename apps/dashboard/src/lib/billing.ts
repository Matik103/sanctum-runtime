import { getAccessToken } from './supabase'
import { throwResponseError } from './sanitize-error'
import { fetchBillingPlanFromSupabase } from './billing-supabase'

import { apiBaseUrl as apiBase } from './api-url'

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type PlanId = 'observer' | 'personal' | 'operator' | 'team' | 'enterprise'

export function normalizePlanId(raw: string | null | undefined): PlanId {
  if (raw === 'free' || raw === 'developer' || !raw) return 'observer'
  if (raw === 'observer' || raw === 'personal' || raw === 'operator' || raw === 'team' || raw === 'enterprise') {
    return raw
  }
  return 'observer'
}

/** Match plan tiers across legacy ids (free/developer) and observer/Developer label. */
export function isSamePlanTier(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizePlanId(a) === normalizePlanId(b)
}

export interface BillingPlan {
  plan: { id: PlanId; name: string; priceMonthlyUsd: number | null }
  limits: {
    maxRuntimes: number | null
    maxEventsPerMonth: number | null
    maxGovernedActionsPerMonth: number | null
    maxObserveEventsPerMonth: number | null
    maxAgents: number | null
    retentionDays: number
    features: string[]
  }
  usage: {
    eventsThisMonth: number
    governedActionsThisMonth?: number
    observeEventsThisMonth?: number
    runtimesConnected: number
    agentsActive: number
    runtimeHoursThisMonth: number
  }
  quotas: {
    events: { used: number; limit: number | null; pct: number | null }
    governed?: { used: number; limit: number | null; pct: number | null }
    observe?: { used: number; limit: number | null; pct: number | null }
    runtimes: { used: number; limit: number | null; pct: number | null }
    agents?: { used: number; limit: number | null; pct: number | null }
  }
  billing: {
    billingProvider?: string | null
    creemCustomerId?: string | null
    creemSubscriptionId?: string | null
    creemSubscriptionStatus?: string | null
    billingStatus?: string | null
    billingCycleAnchor: string | null
  }
}

export async function syncBillingAfterCheckout(
  orgId: string,
  checkoutId?: string,
): Promise<{
  ok: boolean
  synced: boolean
  planId?: string
  note?: string
}> {
  const fnBase = supabaseFunctionsBase()
  const token = await getAccessToken()
  if (fnBase && token) {
    const res = await fetch(`${fnBase}/creem-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: orgId,
        ...(checkoutId ? { checkout_id: checkoutId } : {}),
      }),
    })
    if (res.ok) {
      return res.json() as Promise<{
        ok: boolean
        synced: boolean
        planId?: string
        note?: string
      }>
    }
    if (res.status !== 503 && res.status !== 502) {
      await throwResponseError(res, 'Could not sync billing (Supabase)')
    }
  }

  const headers = { ...await authHeaders(), 'Content-Type': 'application/json' }
  const res = await fetch(`${apiBase}/v1/billing/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: orgId,
      ...(checkoutId ? { checkout_id: checkoutId } : {}),
    }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not sync billing')
  return res.json() as Promise<{
    ok: boolean
    synced: boolean
    planId?: string
    note?: string
  }>
}

export async function fetchBillingPlan(orgId: string): Promise<BillingPlan> {
  const fromDb = await fetchBillingPlanFromSupabase(orgId)

  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase}/v1/billing/plan?org_id=${encodeURIComponent(orgId)}`,
    { headers },
  )

  if (res.ok) {
    const apiPlan = (await res.json()) as BillingPlan
    apiPlan.plan.id = normalizePlanId(apiPlan.plan.id)
    if (apiPlan.plan.id === 'observer') {
      apiPlan.plan.name = 'Developer'
      apiPlan.plan.priceMonthlyUsd = null
      apiPlan.limits.maxEventsPerMonth = 0
      apiPlan.limits.maxGovernedActionsPerMonth = 0
      if (apiPlan.quotas.events) apiPlan.quotas.events.limit = 0
      if (apiPlan.quotas.governed) apiPlan.quotas.governed.limit = 0
    }
    if (fromDb?.plan) {
      const mergedId = normalizePlanId(fromDb.plan.id)
      apiPlan.plan = {
        ...fromDb.plan,
        id: mergedId,
        name: mergedId === 'observer' ? 'Developer' : fromDb.plan.name,
        priceMonthlyUsd: mergedId === 'observer' ? null : fromDb.plan.priceMonthlyUsd,
      }
      apiPlan.billing = { ...apiPlan.billing, ...fromDb.billing }
    }
    return apiPlan
  }

  if (fromDb?.plan) {
    const planId = normalizePlanId(fromDb.plan.id)
    // Fallback limits when API is unreachable — must match entitlements.ts PLAN_DEFAULTS
    const limits: Record<string, { runtimes: number; governed: number | null; agents: number; retention: number }> = {
      observer: { runtimes: 3, governed: 0, agents: 2, retention: 7 },
      personal: { runtimes: 5, governed: 500, agents: 5, retention: 30 },
      operator: { runtimes: 25, governed: 500_000, agents: 10, retention: 30 },
      team: { runtimes: 250, governed: 10_000_000, agents: 50, retention: 30 },
      enterprise: { runtimes: 0, governed: null, agents: 0, retention: 90 },
    }
    const lim = limits[planId] ?? limits.observer
    return {
      plan: fromDb.plan,
      limits: {
        maxRuntimes: lim.runtimes || null,
        maxEventsPerMonth: lim.governed,
        maxGovernedActionsPerMonth: lim.governed,
        maxObserveEventsPerMonth: null,
        maxAgents: lim.agents || null,
        retentionDays: lim.retention,
        features: [],
      },
      usage: {
        eventsThisMonth: 0,
        governedActionsThisMonth: 0,
        observeEventsThisMonth: 0,
        runtimesConnected: 0,
        agentsActive: 0,
        runtimeHoursThisMonth: 0,
      },
      quotas: {
        events: { used: 0, limit: lim.governed, pct: lim.governed ? 0 : null },
        governed: { used: 0, limit: lim.governed, pct: lim.governed ? 0 : null },
        observe: { used: 0, limit: null, pct: null },
        runtimes: { used: 0, limit: lim.runtimes || null, pct: lim.runtimes ? 0 : null },
        agents: { used: 0, limit: lim.agents || null, pct: lim.agents ? 0 : null },
      },
      billing: {
        billingCycleAnchor: fromDb.billing?.billingCycleAnchor ?? null,
        ...fromDb.billing,
      },
    }
  }

  // API unreachable but workspace exists — show Developer defaults so new accounts see the free tier.
  return defaultDeveloperBillingPlan()
}

function defaultDeveloperBillingPlan(): BillingPlan {
  return {
    plan: { id: 'observer', name: 'Developer', priceMonthlyUsd: null },
    limits: {
      maxRuntimes: 3,
      maxEventsPerMonth: 0,
      maxGovernedActionsPerMonth: 0,
      maxObserveEventsPerMonth: null,
      maxAgents: 2,
      retentionDays: 7,
      features: [],
    },
    usage: {
      eventsThisMonth: 0,
      governedActionsThisMonth: 0,
      observeEventsThisMonth: 0,
      runtimesConnected: 0,
      agentsActive: 0,
      runtimeHoursThisMonth: 0,
    },
    quotas: {
      events: { used: 0, limit: 0, pct: null },
      governed: { used: 0, limit: 0, pct: null },
      observe: { used: 0, limit: null, pct: null },
      runtimes: { used: 0, limit: 3, pct: 0 },
      agents: { used: 0, limit: 2, pct: 0 },
    },
    billing: {
      billingCycleAnchor: null,
    },
  }
}

function supabaseFunctionsBase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url?.trim()) return null
  return `${url.replace(/\/$/, '')}/functions/v1`
}

export type PlanChangeResult = {
  checkoutUrl: string | null
  billingProvider?: string | null
  message: string | null
  contactEmail?: string
  changed?: boolean
  upgraded?: boolean
  changeType?: 'upgrade' | 'downgrade' | 'cancel_scheduled' | 'cancel_immediate' | 'same'
  planId?: string
  portalUrl?: string
}

/** Upgrade, downgrade, cancel to Observer, or new checkout — via Supabase creem-checkout. */
export async function changePlan(orgId: string, planId: PlanId): Promise<PlanChangeResult> {
  const fnBase = supabaseFunctionsBase()
  const token = await getAccessToken()

  if (!fnBase) {
    return {
      checkoutUrl: null,
      billingProvider: null,
      message:
        'Billing checkout is not wired on this console build (missing VITE_SUPABASE_URL). '
        + 'Creem billing runs on Supabase Edge Functions — set VITE_SUPABASE_URL on sanctum-dashboard and redeploy.',
      contactEmail: 'billing@sanctumruntime.com',
    }
  }

  if (!token) {
    return {
      checkoutUrl: null,
      billingProvider: null,
      message: 'Sign in again to change billing plans (session expired).',
      contactEmail: 'billing@sanctumruntime.com',
    }
  }

  const res = await fetch(`${fnBase}/creem-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ org_id: orgId, plan_id: planId }),
  })
  if (res.ok) {
    return res.json() as Promise<PlanChangeResult>
  }

  let body: { error?: string; hint?: string; detail?: string } = {}
  try {
    body = await res.json() as typeof body
  } catch {
    /* non-JSON error body */
  }

  if (res.status === 401 || res.status === 403) {
    await throwResponseError(res, 'Could not change plan (Supabase)')
  }

  const hint = body.hint?.trim() || ''
  const detail = body.detail?.trim()
  const errCode = body.error ?? `http_${res.status}`
  return {
    checkoutUrl: null,
    billingProvider: null,
    message: hint
      || (detail && !detail.startsWith('{')
        ? `Billing change failed (${errCode}): ${detail}`
        : `Billing change failed (${errCode}). Run creem:verify-remote or see docs/CREEM_SUPABASE.md.`),
    contactEmail: 'billing@sanctumruntime.com',
  }
}

/** @deprecated Use changePlan — kept for callers that exclude observer. */
export async function createCheckout(
  orgId: string,
  planId: Exclude<PlanId, 'observer'>,
): Promise<PlanChangeResult> {
  return changePlan(orgId, planId)
}

export async function openCustomerPortal(orgId: string): Promise<{ portalUrl: string | null; message: string | null }> {
  const fnBase = supabaseFunctionsBase()
  const token = await getAccessToken()
  if (!fnBase || !token) {
    return { portalUrl: null, message: 'Supabase billing portal is not configured.' }
  }

  const res = await fetch(`${fnBase}/creem-portal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ org_id: orgId }),
  })

  if (res.ok) {
    const data = await res.json() as { portalUrl?: string; message?: string | null }
    return { portalUrl: data.portalUrl ?? null, message: data.message ?? null }
  }

  let body: { hint?: string; error?: string } = {}
  try {
    body = await res.json() as typeof body
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) {
    await throwResponseError(res, 'Could not open billing portal')
  }
  return {
    portalUrl: null,
    message: body.hint ?? body.error ?? 'Could not open Creem customer portal.',
  }
}

export const PLAN_ORDER: PlanId[] = ['observer', 'personal', 'operator', 'team', 'enterprise']

export function formatLimit(n: number | null, unit = ''): string {
  if (n === null) return 'Unlimited'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M${unit}`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k${unit}`
  return `${n}${unit}`
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
