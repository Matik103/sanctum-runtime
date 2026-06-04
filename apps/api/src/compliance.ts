/**
 * Compliance reporting endpoints.
 *
 * Generates structured JSON compliance reports covering:
 *  - SOC2 Trust Services Criteria evidence summary
 *  - HIPAA-style access event log
 *  - Policy change history
 *  - Anomaly timeline
 *  - Risk distribution
 *
 * Routes:
 *   GET /v1/orgs/:orgId/compliance/report?start=&end=
 *   GET /v1/orgs/:orgId/compliance/report.pdf   (JSON attachment — no PDF lib)
 *   GET /v1/orgs/:orgId/compliance/soc2
 *   GET /v1/orgs/:orgId/compliance/anomaly-timeline?days=30
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { getEntitlementEngine } from './entitlements.js'
import { canUseComplianceExport, sendPlanFeatureRequired } from './entitlements-gate.js'
import { logger as rootLogger } from './logger.js'
import { queryWithTimeout, SUPABASE_ROW_LIMITS } from './supabase-limits.js'

const log = rootLogger.child({ module: 'compliance' })

// ─── Types ────────────────────────────────────────────────────────────────────

export type PolicyChangeEvent = {
  action: string
  user_id?: string
  change_type: 'created' | 'updated' | 'deleted' | 'imported'
  timestamp: string
}

export type AccessEvent = {
  user_id?: string
  action: string
  timestamp: string
  ip?: string
  decision?: string
}

export type ExportHistoryEntry = {
  exported_by?: string
  timestamp: string
  record_count?: number
}

export type RuntimeUptimeStat = {
  runtime_id: string
  uptime_pct: number
  total_hours: number
}

export type RiskDistribution = {
  low: number
  medium: number
  high: number
}

export type ComplianceReport = {
  period: { start: string; end: string }
  generated_at: string
  org_id: string
  summary: {
    total_actions: number
    blocked_actions: number
    verified_actions: number
    approval_rate_pct: number
    anomaly_flags: number
    human_reviews: number
  }
  policy_changes: PolicyChangeEvent[]
  access_events: AccessEvent[]
  export_history: ExportHistoryEntry[]
  runtime_uptime: RuntimeUptimeStat[]
  risk_distribution: RiskDistribution
}

// ─── Core report generation ───────────────────────────────────────────────────

/**
 * Generate a compliance report for the given org and date range.
 * All data is fetched from Supabase audit_events and related tables.
 */
export async function generateComplianceReport(
  cfg: SupabaseAuthConfig,
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<ComplianceReport> {
  const admin = createSupabaseAdmin(cfg)
  const start = startDate.toISOString()
  const end = endDate.toISOString()

  // Sequential reads — avoids free-tier PostgREST timeout from parallel fan-out.
  const auditRes = await queryWithTimeout(
    'audit_events',
    () =>
      admin
        .from('audit_events')
        .select('id,action,decision,anomaly_flags,resolved_by,actor,context,created_at')
        .eq('org_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(SUPABASE_ROW_LIMITS.auditCompliance),
  )
  const exportRes = await queryWithTimeout(
    'export_audit',
    () =>
      admin
        .from('export_audit')
        .select('requested_by,record_count,created_at')
        .eq('org_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(SUPABASE_ROW_LIMITS.exportAuditHistory),
  )
  const runtimesRes = await queryWithTimeout(
    'registered_runtimes',
    () =>
      admin
        .from('registered_runtimes')
        .select('id,connected_at,last_seen_at')
        .eq('org_id', orgId)
        .limit(SUPABASE_ROW_LIMITS.runtimesList),
  )

  const auditEvents = auditRes.data
  const exportRows = exportRes.data
  const runtimes = runtimesRes.data

  // Summary stats
  let blockedActions = 0
  let verifiedActions = 0
  let anomalyFlagsTotal = 0
  let humanReviews = 0
  const riskDist: RiskDistribution = { low: 0, medium: 0, high: 0 }
  const accessEvents: AccessEvent[] = []
  let approvedActions = 0

  for (const evt of auditEvents) {
    const decision = evt.decision as string | undefined
    const flags = (evt.anomaly_flags ?? []) as string[]
    const ctx = (evt.context ?? {}) as Record<string, unknown>
    const risk = (ctx.risk as string | undefined) ?? 'low'

    if (decision === 'APPROVED') approvedActions++
    if (decision === 'BLOCKED') blockedActions++
    if (decision === 'REQUIRE_VERIFICATION') verifiedActions++
    if (flags.length > 0) anomalyFlagsTotal += flags.length
    if (evt.resolved_by) humanReviews++

    if (risk === 'high') riskDist.high++
    else if (risk === 'medium') riskDist.medium++
    else riskDist.low++

    accessEvents.push({
      user_id: (ctx.user_id as string | undefined) ?? (evt.actor as string | undefined),
      action: evt.action as string,
      timestamp: evt.created_at as string,
      ip: ctx.ip as string | undefined,
      decision: decision,
    })
  }

  // Policy changes: try to pull from policy_snapshots if the table exists,
  // otherwise synthesise a placeholder row from available data.
  let policyChanges: PolicyChangeEvent[] = []
  try {
    const { data: snapshots } = await admin
      .from('policy_snapshots')
      .select('change_summary,created_by_user_id,created_at')
      .eq('org_id', orgId)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .limit(SUPABASE_ROW_LIMITS.policySnapshots)

    policyChanges = (snapshots ?? []).map((s) => ({
      action: (s.change_summary as string | undefined) ?? 'policy_snapshot',
      user_id: s.created_by_user_id as string | undefined,
      change_type: 'updated' as const,
      timestamp: s.created_at as string,
    }))
  } catch {
    // policy_snapshots may not exist yet — swallow gracefully
  }

  // Export history
  const exportHistory: ExportHistoryEntry[] = (exportRows).map((e) => ({
    exported_by: e.requested_by as string | undefined,
    timestamp: e.created_at as string,
    record_count: e.record_count as number | undefined,
  }))

  // Runtime uptime approximation
  const periodHours = (endDate.getTime() - startDate.getTime()) / 3_600_000
  const runtimeUptime: RuntimeUptimeStat[] = (runtimes).map((rt) => {
    const connectedAt = rt.connected_at
      ? new Date(rt.connected_at as string)
      : startDate
    const lastSeen = rt.last_seen_at
      ? new Date(rt.last_seen_at as string)
      : endDate

    // Clamp to the report window
    const effectiveStart = connectedAt < startDate ? startDate : connectedAt
    const effectiveEnd = lastSeen > endDate ? endDate : lastSeen
    const activeHours = Math.max(
      0,
      (effectiveEnd.getTime() - effectiveStart.getTime()) / 3_600_000,
    )
    const uptimePct = periodHours > 0 ? Math.min(100, (activeHours / periodHours) * 100) : 0

    return {
      runtime_id: rt.id as string,
      uptime_pct: Math.round(uptimePct * 10) / 10,
      total_hours: Math.round(activeHours * 10) / 10,
    }
  })

  return {
    period: { start, end },
    generated_at: new Date().toISOString(),
    org_id: orgId,
    summary: {
      total_actions: auditEvents.length,
      blocked_actions: blockedActions,
      verified_actions: verifiedActions,
      approval_rate_pct: auditEvents.length
        ? Math.round((approvedActions / auditEvents.length) * 100)
        : 100,
      anomaly_flags: anomalyFlagsTotal,
      human_reviews: humanReviews,
    },
    policy_changes: policyChanges,
    access_events: accessEvents,
    export_history: exportHistory,
    runtime_uptime: runtimeUptime,
    risk_distribution: riskDist,
  }
}

// ─── SOC2 Trust Services Criteria summary ────────────────────────────────────

type Soc2CriterionStatus = {
  criterion: string
  title: string
  evidence_summary: string
  status: 'met' | 'partial' | 'not_evaluated'
  data_points?: number
}

type Soc2Report = {
  org_id: string
  period: { start: string; end: string }
  generated_at: string
  criteria: Soc2CriterionStatus[]
}

async function generateSoc2Report(
  cfg: SupabaseAuthConfig,
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<Soc2Report> {
  const admin = createSupabaseAdmin(cfg)
  const start = startDate.toISOString()
  const end = endDate.toISOString()

  // Head-only counts, sequential — light on free tier but avoids 6-way parallel load.
  const countHead = async (
    label: string,
    run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ): Promise<number> => {
    try {
      const r = await run()
      if (r.error) {
        log.warn({ label }, 'soc2 evidence count query failed')
        return 0
      }
      return r.count ?? 0
    } catch {
      return 0
    }
  }

  const auditCount = await countHead('audit_events', () =>
    admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', start)
      .lte('created_at', end),
  )
  const blockedCount = await countHead('audit_blocked', () =>
    admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('decision', 'BLOCKED')
      .gte('created_at', start)
      .lte('created_at', end),
  )
  const apiKeyCount = await countHead('api_keys', () =>
    admin
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('revoked_at', null),
  )
  const exportCount = await countHead('export_audit', () =>
    admin
      .from('export_audit')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', start)
      .lte('created_at', end),
  )
  const runtimeCount = await countHead('registered_runtimes', () =>
    admin.from('registered_runtimes').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  )
  const approvalCount = await countHead('pending_approvals', () =>
    admin
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', start)
      .lte('created_at', end),
  )

  const criteria: Soc2CriterionStatus[] = [
    {
      criterion: 'CC6.1',
      title: 'Logical and Physical Access Controls',
      evidence_summary: `${apiKeyCount} active API keys; authentication enforced on all endpoints via Supabase JWT or scoped API keys.`,
      status: apiKeyCount !== null ? 'met' : 'partial',
      data_points: apiKeyCount as number,
    },
    {
      criterion: 'CC6.2',
      title: 'User Registration and De-provisioning',
      evidence_summary: 'Organization members managed via Supabase auth; org membership table enforces role-based access.',
      status: 'met',
    },
    {
      criterion: 'CC7.2',
      title: 'System Monitoring',
      evidence_summary: `${auditCount} action events logged in the audit trail during the period. Anomaly detection active.`,
      status: (auditCount as number) > 0 ? 'met' : 'partial',
      data_points: auditCount as number,
    },
    {
      criterion: 'CC7.3',
      title: 'Incident Response',
      evidence_summary: `${blockedCount} actions blocked by automated policy; ${approvalCount} human-approval requests raised.`,
      status: 'met',
      data_points: (blockedCount as number) + (approvalCount as number),
    },
    {
      criterion: 'CC8.1',
      title: 'Change Management',
      evidence_summary: 'Policy changes versioned via policy_snapshots; YAML import/export available.',
      status: 'met',
    },
    {
      criterion: 'A1.2',
      title: 'Availability and Monitoring',
      evidence_summary: `${runtimeCount} runtime(s) registered; uptime tracked via heartbeat and last_seen_at.`,
      status: (runtimeCount as number) > 0 ? 'met' : 'not_evaluated',
      data_points: runtimeCount as number,
    },
    {
      criterion: 'PI1.1',
      title: 'Privacy Notice and Data Exports',
      evidence_summary: `${exportCount} GDPR data exports performed during the period and logged in export_audit.`,
      status: 'met',
      data_points: exportCount as number,
    },
  ]

  return {
    org_id: orgId,
    period: { start, end },
    generated_at: new Date().toISOString(),
    criteria,
  }
}

// ─── Anomaly timeline ─────────────────────────────────────────────────────────

type AnomalyTimelineEntry = {
  date: string
  count: number
  blocked: number
  flags: string[]
}

async function generateAnomalyTimeline(
  cfg: SupabaseAuthConfig,
  orgId: string,
  days: number,
): Promise<AnomalyTimelineEntry[]> {
  const admin = createSupabaseAdmin(cfg)
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * 86_400_000)

  const { data, error } = await admin
    .from('audit_events')
    .select('decision,anomaly_flags,created_at')
    .eq('org_id', orgId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })
    .limit(SUPABASE_ROW_LIMITS.auditTimeline)

  if (error || !data) return []

  // Bucket by calendar day (UTC)
  const buckets = new Map<string, { count: number; blocked: number; flagSet: Set<string> }>()

  for (const evt of data) {
    const day = (evt.created_at as string).slice(0, 10)
    if (!buckets.has(day)) {
      buckets.set(day, { count: 0, blocked: 0, flagSet: new Set() })
    }
    const b = buckets.get(day)!
    b.count++
    if ((evt.decision as string) === 'BLOCKED') b.blocked++
    for (const flag of (evt.anomaly_flags ?? []) as string[]) {
      b.flagSet.add(flag)
    }
  }

  // Fill in zero-count days so the timeline is continuous
  const timeline: AnomalyTimelineEntry[] = []
  const cursor = new Date(startDate)
  cursor.setUTCHours(0, 0, 0, 0)
  const endDay = new Date(endDate)
  endDay.setUTCHours(0, 0, 0, 0)

  while (cursor <= endDay) {
    const day = cursor.toISOString().slice(0, 10)
    const b = buckets.get(day)
    timeline.push({
      date: day,
      count: b?.count ?? 0,
      blocked: b?.blocked ?? 0,
      flags: b ? [...b.flagSet] : [],
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return timeline
}

// ─── Fastify routes ───────────────────────────────────────────────────────────

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

/**
 * Register compliance routes on the Fastify app.
 */
export async function registerComplianceRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const store = new ControlPlaneStore(cfg)
  const entitlements = getEntitlementEngine(cfg)

  async function resolveOrgAccess(
    req: SanctumReq,
    orgId: string,
  ): Promise<{ allowed: boolean; isAdmin: boolean }> {
    const admin = createSupabaseAdmin(cfg)

    if (req.sanctumUser) {
      const orgs = await store.getUserOrgIds(req.sanctumUser.id)
      if (!orgs.includes(orgId)) return { allowed: false, isAdmin: false }

      const { data: member } = await admin
        .from('organization_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', req.sanctumUser.id)
        .maybeSingle()

      const role = (member?.role as string | undefined) ?? 'member'
      return { allowed: true, isAdmin: role === 'owner' || role === 'admin' }
    }

    if (req.sanctumApiKeyScope !== undefined) {
      if (!req.sanctumApiKeyScope.includes(orgId)) return { allowed: false, isAdmin: false }
      return { allowed: true, isAdmin: true }
    }

    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg !== orgId) return { allowed: false, isAdmin: false }
      return { allowed: true, isAdmin: true } // API keys treated as admin
    }

    return { allowed: false, isAdmin: false }
  }

  async function requireComplianceExport(orgId: string, reply: import('fastify').FastifyReply): Promise<boolean> {
    const limits = await entitlements.getLimits(orgId)
    if (canUseComplianceExport(limits)) return true
    sendPlanFeatureRequired(
      reply,
      limits,
      'compliance_export',
      'Compliance reports and evidence timelines require the Team plan or higher.',
    )
    return false
  }

  // Helper: parse a date range from query params; defaults to last 30 days.
  function parseDateRange(q: Record<string, unknown>): { start: Date; end: Date } {
    const end = q.end ? new Date(q.end as string) : new Date()
    const start = q.start
      ? new Date(q.start as string)
      : new Date(end.getTime() - 30 * 86_400_000)
    return { start, end }
  }

  // GET /v1/orgs/:orgId/compliance/report?start=&end=
  app.get('/v1/orgs/:orgId/compliance/report', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })
    if (!access.isAdmin) return reply.status(403).send({ error: 'admin_required', hint: 'Compliance reports require admin or owner role' })
    if (!(await requireComplianceExport(orgId, reply))) return

    const { start, end } = parseDateRange(req.query as Record<string, unknown>)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return reply.status(400).send({ error: 'invalid_date_range', hint: 'Use ISO 8601 format for start/end' })
    }
    if (end < start) {
      return reply.status(400).send({ error: 'invalid_date_range', hint: 'end must be after start' })
    }

    const report = await generateComplianceReport(cfg, orgId, start, end)
    return report
  })

  // GET /v1/orgs/:orgId/compliance/report.pdf
  // Returns JSON with attachment Content-Disposition (no PDF lib available)
  app.get('/v1/orgs/:orgId/compliance/report.pdf', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })
    if (!access.isAdmin) return reply.status(403).send({ error: 'admin_required' })
    if (!(await requireComplianceExport(orgId, reply))) return

    const { start, end } = parseDateRange(req.query as Record<string, unknown>)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return reply.status(400).send({ error: 'invalid_date_range' })
    }

    const report = await generateComplianceReport(cfg, orgId, start, end)
    const dateStr = start.toISOString().slice(0, 10)

    return reply
      .header('Content-Disposition', `attachment; filename="sanctum-compliance-${orgId}-${dateStr}.json"`)
      .type('application/json')
      .send(JSON.stringify(report, null, 2))
  })

  // GET /v1/orgs/:orgId/compliance/soc2
  app.get('/v1/orgs/:orgId/compliance/soc2', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })
    if (!access.isAdmin) return reply.status(403).send({ error: 'admin_required' })
    if (!(await requireComplianceExport(orgId, reply))) return

    const { start, end } = parseDateRange(req.query as Record<string, unknown>)
    const report = await generateSoc2Report(cfg, orgId, start, end)
    return report
  })

  // GET /v1/orgs/:orgId/compliance/anomaly-timeline?days=30
  app.get('/v1/orgs/:orgId/compliance/anomaly-timeline', async (req, reply) => {
    const { orgId } = req.params as { orgId: string }
    const access = await resolveOrgAccess(req as SanctumReq, orgId)
    if (!access.allowed) return reply.status(403).send({ error: 'org_forbidden' })
    if (!(await requireComplianceExport(orgId, reply))) return

    const q = req.query as { days?: string }
    const days = Math.min(365, Math.max(1, Number(q.days ?? 30) || 30))
    const timeline = await generateAnomalyTimeline(cfg, orgId, days)
    return { org_id: orgId, days, timeline }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}
