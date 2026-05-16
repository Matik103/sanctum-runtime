import { getAccessToken } from './supabase'

const apiBase =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export type UsageSummary = {
  orgId: string
  periodDays: number
  from: string
  to: string
  totals: Record<string, number>
  daily: { date: string; metrics: Record<string, number> }[]
}

const METRIC_LABELS: Record<string, string> = {
  'runtime.connect': 'Runtime connections',
  'action.verify': 'Policy verifications',
  'command.dispatch': 'Commands dispatched',
  'marketplace.install': 'Marketplace installs',
  'memory.write': 'Memory writes',
  'agent.register': 'Agent registrations',
}

export function usageMetricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric
}

export async function fetchUsage(orgId: string, days = 30): Promise<UsageSummary> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  const res = await fetch(
    `${apiBase}/v1/usage?org_id=${encodeURIComponent(orgId)}&days=${days}`,
    { headers: h },
  )
  if (!res.ok) throw new Error(`Usage: ${res.status}`)
  return res.json() as Promise<UsageSummary>
}
