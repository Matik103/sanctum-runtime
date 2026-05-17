import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type PlanId = 'free' | 'operator' | 'team' | 'enterprise'

export interface PlanLimits {
  planId: PlanId
  planName: string
  priceMonthlyUsd: number | null
  maxRuntimes: number | null
  maxEventsPerMonth: number | null
  maxAgents: number | null
  retentionDays: number
  features: string[]
}

const PLAN_DEFAULTS: Record<PlanId, PlanLimits> = {
  free: {
    planId: 'free', planName: 'Developer', priceMonthlyUsd: null,
    maxRuntimes: 3, maxEventsPerMonth: 10_000, maxAgents: 5,
    retentionDays: 7, features: ['basic_dashboard', 'community_support'],
  },
  operator: {
    planId: 'operator', planName: 'Operator', priceMonthlyUsd: 49,
    maxRuntimes: 25, maxEventsPerMonth: 500_000, maxAgents: 10,
    retentionDays: 14, features: ['live_telemetry', 'runtime_health', 'api_access', 'alerts', 'cloud_sync'],
  },
  team: {
    planId: 'team', planName: 'Team', priceMonthlyUsd: 299,
    maxRuntimes: 250, maxEventsPerMonth: 10_000_000, maxAgents: 50,
    retentionDays: 30, features: ['sso', 'rbac', 'alerts', 'audit_logs', 'advanced_fleet', 'webhooks'],
  },
  enterprise: {
    planId: 'enterprise', planName: 'Enterprise', priceMonthlyUsd: null,
    maxRuntimes: null, maxEventsPerMonth: null, maxAgents: null,
    retentionDays: 90, features: ['everything', 'air_gap', 'private_cloud', 'sla', 'dedicated_support', 'compliance', 'encrypted_memory'],
  },
}

export class EntitlementEngine {
  constructor(private cfg: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.cfg)
  }

  async getPlanId(orgId: string): Promise<PlanId> {
    try {
      const { data } = await this.admin()
        .from('org_plans')
        .select('plan_id,trial_ends_at')
        .eq('org_id', orgId)
        .maybeSingle()
      // Active trial: treat as operator plan
      if (data?.trial_ends_at && new Date(data.trial_ends_at as string) > new Date()) {
        return 'operator'
      }
      const id = (data?.plan_id as string | undefined) ?? 'free'
      return (id in PLAN_DEFAULTS ? id : 'free') as PlanId
    } catch {
      return 'free'
    }
  }

  async getLimits(orgId: string): Promise<PlanLimits> {
    const planId = await this.getPlanId(orgId)
    return PLAN_DEFAULTS[planId]
  }

  async getNotificationPrefs(orgId: string): Promise<{
    email: string | null
    slackWebhookUrl: string | null
    notificationWebhookUrl: string | null
    quotaWarningPct: number
  }> {
    try {
      const { data } = await this.admin()
        .from('org_plans')
        .select('notification_email,slack_webhook_url,notification_webhook_url,quota_warning_pct')
        .eq('org_id', orgId)
        .maybeSingle()
      return {
        email: (data?.notification_email as string | null) ?? null,
        slackWebhookUrl: (data?.slack_webhook_url as string | null) ?? null,
        notificationWebhookUrl: (data?.notification_webhook_url as string | null) ?? null,
        quotaWarningPct: (data?.quota_warning_pct as number | null) ?? 80,
      }
    } catch {
      return { email: null, slackWebhookUrl: null, notificationWebhookUrl: null, quotaWarningPct: 80 }
    }
  }

  async getActiveRuntimeCount(orgId: string): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 120_000).toISOString() // 2min stale window
      const { count } = await this.admin()
        .from('registered_runtimes')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('last_seen_at', cutoff)
      return count ?? 0
    } catch {
      return 0
    }
  }

  async checkRuntimeSlot(orgId: string): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const limits = await this.getLimits(orgId)
    if (limits.maxRuntimes === null) return { allowed: true, used: 0, limit: null }
    const used = await this.getActiveRuntimeCount(orgId)
    return { allowed: used < limits.maxRuntimes, used, limit: limits.maxRuntimes }
  }

  async getMonthlyEventCount(orgId: string): Promise<number> {
    try {
      const from = new Date()
      from.setDate(1)
      from.setHours(0, 0, 0, 0)
      const { data } = await this.admin()
        .from('usage_events')
        .select('quantity')
        .eq('org_id', orgId)
        .gte('recorded_at', from.toISOString())
      return (data ?? []).reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
    } catch {
      return 0
    }
  }

  async checkEventQuota(orgId: string): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const limits = await this.getLimits(orgId)
    if (limits.maxEventsPerMonth === null) return { allowed: true, used: 0, limit: null }
    const used = await this.getMonthlyEventCount(orgId)
    return { allowed: used < limits.maxEventsPerMonth, used, limit: limits.maxEventsPerMonth }
  }

  hasFeature(limits: PlanLimits, feature: string): boolean {
    return limits.features.includes('everything') || limits.features.includes(feature)
  }
}

let sharedEngine: EntitlementEngine | null = null

export function getEntitlementEngine(cfg: SupabaseAuthConfig): EntitlementEngine {
  if (!sharedEngine) sharedEngine = new EntitlementEngine(cfg)
  return sharedEngine
}

export { PLAN_DEFAULTS }
