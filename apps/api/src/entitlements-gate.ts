import type { FastifyReply } from 'fastify'
import type { ActionResult } from '@sanctum/runtime-engine'
import type { EntitlementEngine, PlanLimits, PlanId } from './entitlements.js'
import { PLAN_DEFAULTS } from './entitlements.js'

export const BILLING_CONTACT = 'billing@sanctumruntime.com'

export type QuotaKind = 'governed' | 'observe'

const PLAN_FEATURES_WITH_INHERITANCE: Record<PlanId, string[]> = {
  observer: PLAN_DEFAULTS.observer.features,
  personal: [
    ...PLAN_DEFAULTS.observer.features,
    ...PLAN_DEFAULTS.personal.features,
  ],
  operator: [
    ...PLAN_DEFAULTS.observer.features,
    ...PLAN_DEFAULTS.personal.features,
    ...PLAN_DEFAULTS.operator.features,
  ],
  team: [
    ...PLAN_DEFAULTS.observer.features,
    ...PLAN_DEFAULTS.personal.features,
    ...PLAN_DEFAULTS.operator.features,
    ...PLAN_DEFAULTS.team.features,
  ],
  enterprise: ['everything'],
}

export function hasPlanFeature(limits: PlanLimits, feature: string): boolean {
  if (limits.features.includes('everything') || limits.features.includes(feature)) return true
  return PLAN_FEATURES_WITH_INHERITANCE[limits.planId]?.includes(feature) ?? false
}

export function canUseConnectGate(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'light_gates') || hasPlanFeature(limits, 'holds_approve')
}

export function canEvaluateShieldRules(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'light_gates') || hasPlanFeature(limits, 'shield_rules')
}

export function canUseCustomShield(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'shield_rules')
}

export function canUseShieldPresets(limits: PlanLimits): boolean {
  return canEvaluateShieldRules(limits)
}

export function canUseGovernanceWorkflows(limits: PlanLimits): boolean {
  return (
    hasPlanFeature(limits, 'holds_approve') ||
    hasPlanFeature(limits, 'advanced_fleet') ||
    hasPlanFeature(limits, 'rbac')
  )
}

export function canUseFleetControls(limits: PlanLimits): boolean {
  return canUseGovernanceWorkflows(limits) || hasPlanFeature(limits, 'api_access')
}

export function canUseApiAccess(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'api_access') || hasPlanFeature(limits, 'advanced_fleet')
}

export function canUseOrchestration(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'advanced_fleet')
}

export function canUseComplianceExport(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'compliance_export') || hasPlanFeature(limits, 'compliance')
}

export function canUseAgentMemory(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'cloud_sync') || hasPlanFeature(limits, 'advanced_fleet')
}

export function canUseAuditReplay(limits: PlanLimits): boolean {
  return canUseConnectGate(limits) || canUseComplianceExport(limits)
}

export function canUsePolicyVersioning(limits: PlanLimits): boolean {
  return canUseConnectGate(limits) || canUseComplianceExport(limits)
}

export function canUseDelegations(limits: PlanLimits): boolean {
  return canUseGovernanceWorkflows(limits)
}

export function canUseMarketplaceInstalls(limits: PlanLimits): boolean {
  return canUseConnectGate(limits) || canUseCustomShield(limits)
}

export function canUseMarketplacePublishing(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'rbac') || canUseComplianceExport(limits)
}

export function canUseOrgWebhooks(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'webhooks')
}

export function canUseAlertRules(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'alerts') || hasPlanFeature(limits, 'email_alerts')
}

export function canUseAlertChannels(limits: PlanLimits, channels: string[]): boolean {
  if (!canUseAlertRules(limits)) return false
  const needsWebhooks = channels.some((c) => c === 'webhook' || c === 'slack')
  if (needsWebhooks && !hasPlanFeature(limits, 'webhooks')) return false
  return true
}

export function canApproveHolds(limits: PlanLimits): boolean {
  return hasPlanFeature(limits, 'holds_approve') || hasPlanFeature(limits, 'light_gates')
}

export function upgradePlanHint(current: PlanId, feature: string): string {
  const order: PlanId[] = ['observer', 'personal', 'operator', 'team', 'enterprise']
  const need =
    feature === 'light_gates' || feature === 'connect'
      ? 'personal'
      : feature === 'shield_rules' || feature === 'holds_approve' || feature === 'webhooks' || feature === 'api_access' || feature === 'cloud_sync'
        ? 'operator'
        : feature === 'compliance_export' || feature === 'sso' || feature === 'advanced_fleet' || feature === 'rbac'
          ? 'team'
          : 'operator'
  const idx = order.indexOf(current)
  const targetIdx = order.indexOf(need)
  if (targetIdx > idx) return PLAN_DEFAULTS[need].planName
  return PLAN_DEFAULTS.operator.planName
}

export function sendPlanFeatureRequired(
  reply: FastifyReply,
  limits: PlanLimits,
  feature: string,
  message?: string,
): void {
  reply.status(402).send({
    error: 'plan_feature_required',
    feature,
    currentPlan: limits.planId,
    planName: limits.planName,
    message:
      message ??
      `${feature} is not included on the ${limits.planName} plan. Upgrade to ${upgradePlanHint(limits.planId, feature)} or contact ${BILLING_CONTACT}.`,
    upgradeUrl: '/billing',
  })
}

export function sendQuotaExceeded(
  reply: FastifyReply,
  kind: QuotaKind,
  used: number,
  limit: number,
  limits: PlanLimits,
): void {
  const label = kind === 'governed' ? 'governed actions' : 'observe events'
  reply.status(402).send({
    error: 'quota_exceeded',
    quota: kind,
    used,
    limit,
    currentPlan: limits.planId,
    planName: limits.planName,
    message: `Monthly ${label} quota reached (${used.toLocaleString()} / ${limit.toLocaleString()}). Upgrade your plan to continue.`,
    upgradeUrl: '/billing',
  })
}

export function sendAgentLimitReached(
  reply: FastifyReply,
  used: number,
  limit: number,
  limits: PlanLimits,
): void {
  reply.status(402).send({
    error: 'agent_limit_reached',
    used,
    limit,
    currentPlan: limits.planId,
    planName: limits.planName,
    message: `Your ${limits.planName} plan allows ${limit} active agent${limit === 1 ? '' : 's'}. Revoke an agent or upgrade to add more.`,
    upgradeUrl: '/billing',
  })
}

export function buildGovernedQuotaBlockedResult(input: {
  actor: string
  action: string
  context: Record<string, unknown>
  correlationId?: string
  used: number
  limit: number
  planName: string
}): ActionResult {
  return {
    id: crypto.randomUUID(),
    correlationId: input.correlationId ?? crypto.randomUUID(),
    actor: input.actor,
    action: input.action,
    context: input.context,
    decision: 'BLOCKED',
    risk: 'high',
    reasoning: `Monthly governed action quota exceeded (${input.used.toLocaleString()} / ${input.limit.toLocaleString()} on ${input.planName}). Upgrade your plan to continue verifying actions.`,
    policyPath: 'billing:governed_quota',
    policyVersion: 'billing:1',
    anomalyFlags: ['quota_exceeded'],
    modelInvoked: false,
    modelConfidence: null,
    timestamp: new Date().toISOString(),
    offlineMode: false,
    ollamaConnected: false,
  }
}

/** Returns a BLOCKED ActionResult when governed quota is exhausted; otherwise null. */
export async function governedQuotaBlock(
  engine: EntitlementEngine,
  orgId: string,
  input: {
    actor: string
    action: string
    context: Record<string, unknown>
    correlationId?: string
  },
): Promise<ActionResult | null> {
  const [quota, limits] = await Promise.all([
    engine.checkGovernedQuota(orgId),
    engine.getLimits(orgId),
  ])
  if (quota.allowed || quota.limit === null) return null
  return buildGovernedQuotaBlockedResult({
    ...input,
    used: quota.used,
    limit: quota.limit,
    planName: limits.planName,
  })
}

export async function assertGovernedQuotaForReply(
  engine: EntitlementEngine,
  orgId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const [quota, limits] = await Promise.all([
    engine.checkGovernedQuota(orgId),
    engine.getLimits(orgId),
  ])
  if (quota.allowed || quota.limit === null) return true
  sendQuotaExceeded(reply, 'governed', quota.used, quota.limit, limits)
  return false
}

export async function assertObserveQuotaForReply(
  engine: EntitlementEngine,
  orgId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const [quota, limits] = await Promise.all([
    engine.checkObserveQuota(orgId),
    engine.getLimits(orgId),
  ])
  if (quota.allowed || quota.limit === null) return true
  sendQuotaExceeded(reply, 'observe', quota.used, quota.limit, limits)
  return false
}
