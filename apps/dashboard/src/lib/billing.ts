import { getAccessToken } from './supabase'
import { throwResponseError } from './sanitize-error'

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
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase}/v1/billing/plan?org_id=${encodeURIComponent(orgId)}`,
    { headers },
  )
  if (!res.ok) await throwResponseError(res, 'Could not load billing info')
  return res.json() as Promise<BillingPlan>
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
