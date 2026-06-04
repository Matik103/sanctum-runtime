import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { UsageMetrics } from './usage-store.js'

export type PlanId = 'observer' | 'personal' | 'operator' | 'team' | 'enterprise'

/** Legacy org_plans.plan_id values still seen in the wild. */
export type LegacyPlanId = 'free' | PlanId

export interface PlanLimits {
  planId: PlanId
  planName: string
  priceMonthlyUsd: number | null
  maxRuntimes: number | null
  /** Governed actions (verify, gate, hold) per month. */
  maxGovernedActionsPerMonth: number | null
  /** Observe-only events (Connect live feed) per month; null = unlimited. */
  maxObserveEventsPerMonth: number | null
  maxAgents: number | null
  retentionDays: number
  features: string[]
  /** @deprecated Use maxGovernedActionsPerMonth — kept for API compat. */
  maxEventsPerMonth: number | null
}

const PLAN_DEFAULTS: Record<PlanId, PlanLimits> = {
  observer: {
    planId: 'observer',
    planName: 'Observer',
    priceMonthlyUsd: null,
    maxRuntimes: 3,
    maxGovernedActionsPerMonth: 50,
    maxObserveEventsPerMonth: null,
    maxAgents: 2,
    retentionDays: 7,
    features: ['connect', 'live_feed', 'observe_mode', 'basic_dashboard', 'community_support'],
    maxEventsPerMonth: 50,
  },
  personal: {
    planId: 'personal',
    planName: 'Personal',
    priceMonthlyUsd: 12,
    maxRuntimes: 5,
    maxGovernedActionsPerMonth: 500,
    maxObserveEventsPerMonth: null,
    maxAgents: 5,
    retentionDays: 30,
    features: [
      'connect',
      'live_feed',
      'observe_mode',
      'light_gates',
      'weekly_digest',
      'basic_dashboard',
      'email_alerts',
    ],
    maxEventsPerMonth: 500,
  },
  operator: {
    planId: 'operator',
    planName: 'Operator',
    priceMonthlyUsd: 59,
    maxRuntimes: 25,
    maxGovernedActionsPerMonth: 500_000,
    maxObserveEventsPerMonth: null,
    maxAgents: 10,
    retentionDays: 30,
    features: [
      'connect',
      'live_feed',
      'shield_rules',
      'webhooks',
      'live_telemetry',
      'runtime_health',
      'api_access',
      'alerts',
      'cloud_sync',
      'holds_approve',
    ],
    maxEventsPerMonth: 500_000,
  },
  team: {
    planId: 'team',
    planName: 'Team',
    priceMonthlyUsd: 299,
    maxRuntimes: 250,
    maxGovernedActionsPerMonth: 10_000_000,
    maxObserveEventsPerMonth: null,
    maxAgents: 50,
    retentionDays: 30,
    features: [
      'connect',
      'live_feed',
      'shield_rules',
      'sso',
      'rbac',
      'alerts',
      'audit_logs',
      'advanced_fleet',
      'webhooks',
      'compliance_export',
    ],
    maxEventsPerMonth: 10_000_000,
  },
  enterprise: {
    planId: 'enterprise',
    planName: 'Enterprise',
    priceMonthlyUsd: null,
    maxRuntimes: null,
    maxGovernedActionsPerMonth: null,
    maxObserveEventsPerMonth: null,
    maxAgents: null,
    retentionDays: 90,
    features: [
      'everything',
      'air_gap',
      'private_cloud',
      'sla',
      'dedicated_support',
      'compliance',
      'encrypted_memory',
    ],
    maxEventsPerMonth: null,
  },
}

export function normalizePlanId(raw: string | undefined | null): PlanId {
  if (raw === 'free' || raw === 'developer' || !raw) return 'observer'
  if (raw in PLAN_DEFAULTS) return raw as PlanId
  return 'observer'
}

export const PLAN_ORDER: PlanId[] = ['observer', 'personal', 'operator', 'team', 'enterprise']

export class EntitlementEngine {
  private _admin: ReturnType<typeof createSupabaseAdmin>

  constructor(private cfg: SupabaseAuthConfig) {
    this._admin = createSupabaseAdmin(cfg)
  }

  private admin() {
    return this._admin
  }

  async getPlanId(orgId: string): Promise<PlanId> {
    try {
      const { data } = await this.admin()
        .from('org_plans')
        .select('plan_id,trial_ends_at')
        .eq('org_id', orgId)
        .maybeSingle()
      if (data?.trial_ends_at && new Date(data.trial_ends_at as string) > new Date()) {
        return 'operator'
      }
      return normalizePlanId(data?.plan_id as string | undefined)
    } catch {
      return 'observer'
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
      const cutoff = new Date(Date.now() - 120_000).toISOString()
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

  async getActiveAgentCount(orgId: string): Promise<number> {
    try {
      const { count } = await this.admin()
        .from('agent_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('revoked_at', null)
      return count ?? 0
    } catch {
      return 0
    }
  }

  async checkAgentSlot(orgId: string): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const limits = await this.getLimits(orgId)
    if (limits.maxAgents === null) return { allowed: true, used: 0, limit: null }
    const used = await this.getActiveAgentCount(orgId)
    return { allowed: used < limits.maxAgents, used, limit: limits.maxAgents }
  }

  async getMonthlyMetricSum(orgId: string, metric: string): Promise<number> {
    try {
      const from = new Date()
      from.setDate(1)
      from.setHours(0, 0, 0, 0)
      const { data, error } = await this.admin()
        .from('usage_events')
        .select('quantity')
        .eq('org_id', orgId)
        .eq('metric', metric)
        .gte('recorded_at', from.toISOString())
      if (error) return 0
      return (data ?? []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    } catch {
      return 0
    }
  }

  async getMonthlyGovernedCount(orgId: string): Promise<number> {
    return this.getMonthlyMetricSum(orgId, UsageMetrics.ACTION_VERIFY)
  }

  async getMonthlyObserveCount(orgId: string): Promise<number> {
    return this.getMonthlyMetricSum(orgId, UsageMetrics.ACTION_OBSERVE)
  }

  /** @deprecated Prefer getMonthlyGovernedCount */
  async getMonthlyEventCount(orgId: string): Promise<number> {
    return this.getMonthlyGovernedCount(orgId)
  }

  async checkGovernedQuota(
    orgId: string,
  ): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const limits = await this.getLimits(orgId)
    const limit = limits.maxGovernedActionsPerMonth
    if (limit === null) return { allowed: true, used: 0, limit: null }
    const used = await this.getMonthlyGovernedCount(orgId)
    return { allowed: used < limit, used, limit }
  }

  async checkObserveQuota(
    orgId: string,
  ): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    const limits = await this.getLimits(orgId)
    const limit = limits.maxObserveEventsPerMonth
    if (limit === null) return { allowed: true, used: 0, limit: null }
    const used = await this.getMonthlyObserveCount(orgId)
    return { allowed: used < limit, used, limit }
  }

  /** @deprecated Prefer checkGovernedQuota */
  async checkEventQuota(orgId: string): Promise<{ allowed: boolean; used: number; limit: number | null }> {
    return this.checkGovernedQuota(orgId)
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
