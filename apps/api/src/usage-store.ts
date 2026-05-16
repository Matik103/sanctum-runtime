import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export const UsageMetrics = {
  RUNTIME_CONNECT: 'runtime.connect',
  ACTION_VERIFY: 'action.verify',
  COMMAND_DISPATCH: 'command.dispatch',
  MARKETPLACE_INSTALL: 'marketplace.install',
  MEMORY_WRITE: 'memory.write',
  AGENT_REGISTER: 'agent.register',
} as const

export type UsageMetric = (typeof UsageMetrics)[keyof typeof UsageMetrics]

export type UsageSummary = {
  orgId: string
  periodDays: number
  from: string
  to: string
  totals: Record<string, number>
  daily: { date: string; metrics: Record<string, number> }[]
}

export class UsageStore {
  constructor(private supabase: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.supabase)
  }

  async record(
    orgId: string,
    metric: string,
    quantity = 1,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const { error } = await this.admin().from('usage_events').insert({
        org_id: orgId,
        metric,
        quantity,
        metadata: metadata ?? {},
      })
      if (error) console.warn('[usage]', error.message)
    } catch (e) {
      console.warn('[usage]', e instanceof Error ? e.message : e)
    }
  }

  async summary(orgId: string, periodDays = 30): Promise<UsageSummary> {
    const to = new Date()
    const from = new Date(to.getTime() - periodDays * 86_400_000)
    const fromIso = from.toISOString()
    const toIso = to.toISOString()

    const { data, error } = await this.admin()
      .from('usage_events')
      .select('metric, quantity, recorded_at')
      .eq('org_id', orgId)
      .gte('recorded_at', fromIso)
      .lte('recorded_at', toIso)
      .order('recorded_at', { ascending: true })
    if (error) throw new Error(error.message)

    const totals: Record<string, number> = {}
    const dailyMap = new Map<string, Record<string, number>>()

    for (const row of data ?? []) {
      const m = row.metric as string
      const q = Number(row.quantity) || 1
      totals[m] = (totals[m] ?? 0) + q

      const day = (row.recorded_at as string).slice(0, 10)
      const bucket = dailyMap.get(day) ?? {}
      bucket[m] = (bucket[m] ?? 0) + q
      dailyMap.set(day, bucket)
    }

    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, metrics]) => ({ date, metrics }))

    return {
      orgId,
      periodDays,
      from: fromIso,
      to: toIso,
      totals,
      daily,
    }
  }
}

let sharedUsage: UsageStore | null = null

export function getUsageStore(cfg: SupabaseAuthConfig): UsageStore {
  if (!sharedUsage) sharedUsage = new UsageStore(cfg)
  return sharedUsage
}

/** Fire-and-forget usage record when Supabase is configured. */
export function recordUsage(
  cfg: SupabaseAuthConfig | null,
  orgId: string | null | undefined,
  metric: string,
  quantity = 1,
  metadata?: Record<string, unknown>,
) {
  if (!cfg || !orgId) return
  void getUsageStore(cfg).record(orgId, metric, quantity, metadata)
}
