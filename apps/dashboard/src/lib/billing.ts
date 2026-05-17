import { getAccessToken } from './supabase'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type PlanId = 'free' | 'operator' | 'team' | 'enterprise'

export interface BillingPlan {
  plan: { id: PlanId; name: string; priceMonthlyUsd: number | null }
  limits: {
    maxRuntimes: number | null
    maxEventsPerMonth: number | null
    maxAgents: number | null
    retentionDays: number
    features: string[]
  }
  usage: {
    eventsThisMonth: number
    runtimesConnected: number
    agentsActive: number
    runtimeHoursThisMonth: number
  }
  quotas: {
    events: { used: number; limit: number | null; pct: number | null }
    runtimes: { used: number; limit: number | null; pct: number | null }
  }
  billing: {
    paddleCustomerId: string | null
    paddleSubscriptionId: string | null
    billingCycleAnchor: string | null
  }
}

export async function fetchBillingPlan(orgId: string): Promise<BillingPlan> {
  const headers = await authHeaders()
  const res = await fetch(`${apiBase}/v1/billing/plan?org_id=${encodeURIComponent(orgId)}`, { headers })
  if (!res.ok) throw new Error(`billing_plan_error: ${res.status}`)
  return res.json() as Promise<BillingPlan>
}

export async function createCheckout(orgId: string, planId: PlanId): Promise<{ checkoutUrl: string | null; message: string | null; contactEmail?: string }> {
  const headers = { ...await authHeaders(), 'Content-Type': 'application/json' }
  const res = await fetch(`${apiBase}/v1/billing/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ org_id: orgId, plan_id: planId }),
  })
  if (!res.ok) throw new Error(`checkout_error: ${res.status}`)
  return res.json()
}

export const PLAN_ORDER: PlanId[] = ['free', 'operator', 'team', 'enterprise']

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
