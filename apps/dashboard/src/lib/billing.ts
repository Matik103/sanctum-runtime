import { getAccessToken } from './supabase'
import { throwResponseError } from './sanitize-error'
import { fetchBillingPlanFromSupabase } from './billing-supabase'

import { apiBaseUrl as apiBase } from './api-url'

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type PlanId = 'observer' | 'personal' | 'operator' | 'team' | 'enterprise'

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
    if (fromDb?.plan) {
      apiPlan.plan = fromDb.plan
      apiPlan.billing = { ...apiPlan.billing, ...fromDb.billing }
    }
    return apiPlan
  }

  if (fromDb?.plan) {
    const planId = fromDb.plan.id
    return {
      plan: fromDb.plan,
      limits: {
        maxRuntimes: planId === 'observer' ? 3 : planId === 'personal' ? 5 : planId === 'operator' ? 25 : 250,
        maxEventsPerMonth: planId === 'observer' ? 50 : planId === 'personal' ? 500 : null,
        maxGovernedActionsPerMonth: planId === 'observer' ? 50 : planId === 'personal' ? 500 : null,
        maxObserveEventsPerMonth: null,
        maxAgents: planId === 'observer' ? 2 : planId === 'personal' ? 5 : 10,
        retentionDays: planId === 'observer' ? 7 : 30,
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
        events: { used: 0, limit: 50, pct: 0 },
        governed: { used: 0, limit: 50, pct: 0 },
        observe: { used: 0, limit: null, pct: null },
        runtimes: { used: 0, limit: 3, pct: 0 },
        agents: { used: 0, limit: 2, pct: 0 },
      },
      billing: {
        billingCycleAnchor: fromDb.billing?.billingCycleAnchor ?? null,
        ...fromDb.billing,
      },
    }
  }

  await throwResponseError(res, 'Could not load billing info')
  throw new Error('Could not load billing info')
}

function supabaseFunctionsBase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url?.trim()) return null
  return `${url.replace(/\/$/, '')}/functions/v1`
}

export async function createCheckout(
  orgId: string,
  planId: Exclude<PlanId, 'observer'>,
): Promise<{
  checkoutUrl: string | null
  billingProvider?: string | null
  message: string | null
  contactEmail?: string
}> {
  const fnBase = supabaseFunctionsBase()
  const token = await getAccessToken()
  if (fnBase && token) {
    const res = await fetch(`${fnBase}/creem-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ org_id: orgId, plan_id: planId }),
    })
    if (res.ok) {
      return res.json() as Promise<{
        checkoutUrl: string | null
        billingProvider?: string | null
        message: string | null
      }>
    }

    let body: { error?: string; hint?: string; detail?: string } = {}
    try {
      body = await res.json() as typeof body
    } catch {
      /* non-JSON error body */
    }

    if (res.status === 401 || res.status === 403) {
      await throwResponseError(res, 'Could not open checkout (Supabase)')
    }

    const secretName = `CREEM_PRODUCT_${planId.toUpperCase()}`
    const hint = body.hint?.trim()
      || (body.error === 'product_not_configured' || body.error === 'creem_api_key_not_configured'
        ? `Set ${body.error === 'creem_api_key_not_configured' ? 'CREEM_API_KEY' : secretName} in Supabase Edge Function secrets (docs/CREEM_SUPABASE.md).`
        : '')
    const detail = body.detail?.trim()
    const errCode = body.error ?? `http_${res.status}`

    return {
      checkoutUrl: null,
      billingProvider: null,
      message: hint
        ? `Creem checkout is not configured. ${hint}`
        : detail
          ? `Creem checkout failed (${errCode}): ${detail}`
          : `Creem checkout failed (${errCode}). Configure CREEM_API_KEY and CREEM_PRODUCT_* in Supabase Edge Function secrets. See docs/CREEM_SUPABASE.md.`,
      contactEmail: 'billing@sanctumruntime.com',
    }
  }

  const headers = { ...await authHeaders(), 'Content-Type': 'application/json' }
  const res = await fetch(`${apiBase}/v1/billing/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ org_id: orgId, plan_id: planId }),
  })
  if (!res.ok) await throwResponseError(res, 'Could not open checkout')
  return res.json()
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
