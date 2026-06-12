/**
 * Connect Agent API — health, settings, presets, policy suggestions, execution verify.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { SupabaseAuthConfig } from './auth.js'
import { assertOrgRole } from './rbac.js'
import type { RuntimeEngine } from '@sanctum/runtime-engine'
import { getConnectSettings, upsertConnectSettings } from './connect-settings.js'
import { CONNECT_POLICY_PRESETS, getConnectPreset } from './connect-presets.js'
import { CONNECT_SHIELD_PRESETS, getConnectShieldPreset } from './connect-shield-presets.js'
import { listConnectTools } from './connect-tool-registry.js'
import { countHeldConnectEvents, listConnectProxyEvents } from './connect-live-feed.js'
import { listOrgAuditPage } from './org-audit.js'
import { invalidateShieldRulesCache } from './shield-routes.js'
import { issueAgentToken, verifyAgentToken } from './agent-tokens.js'
import { gateProxyToolCall } from './proxy-gate.js'
import { listPlatformCredentials } from './platform-credentials.js'
import { UsageStore } from './usage-store.js'
import { getEntitlementEngine } from './entitlements.js'
import {
  canUseConnectGate,
  canUseShieldPresets,
  governedQuotaBlock,
  hasPlanFeature,
  sendPlanFeatureRequired,
} from './entitlements-gate.js'
import { policyStorageKey } from './scoped-policy-audit.js'

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

async function requireRole(
  cfg: SupabaseAuthConfig,
  orgId: string,
  userId: string,
  role: 'viewer' | 'member',
  reply: import('fastify').FastifyReply,
): Promise<boolean> {
  try {
    await assertOrgRole(cfg, orgId, userId, role)
    return true
  } catch {
    reply.status(403).send({ error: 'insufficient_role' })
    return false
  }
}

export async function registerConnectRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
  runtime: RuntimeEngine,
): Promise<void> {
  const usage = new UsageStore(cfg)

  app.get('/v1/orgs/:orgId/connect/health', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return

    const admin = (await import('./auth.js')).createSupabaseAdmin(cfg)
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()

    const [auditRes, creds, settings] = await Promise.all([
      admin
        .from('audit_events')
        .select('decision, action, context, created_at')
        .eq('org_id', orgId)
        .gte('created_at', since)
        .contains('context', { proxy: true }),
      listPlatformCredentials(cfg, orgId),
      getConnectSettings(cfg, orgId),
    ])

    const rows = auditRes.data ?? []
    const byDecision: Record<string, number> = {}
    const byPlatform: Record<string, number> = {}
    const byAction: Record<string, number> = {}
    let lastEventAt: string | null = null

    for (const row of rows) {
      const d = String(row.decision ?? 'UNKNOWN')
      byDecision[d] = (byDecision[d] ?? 0) + 1
      const ctx = (row.context as Record<string, unknown> | null) ?? {}
      const plat = String(ctx.platform ?? 'unknown')
      byPlatform[plat] = (byPlatform[plat] ?? 0) + 1
      const act = String(row.action ?? '')
      if (act) byAction[act] = (byAction[act] ?? 0) + 1
      const ts = String(row.created_at ?? '')
      if (ts && (!lastEventAt || ts > lastEventAt)) lastEventAt = ts
    }

    const summary = await usage.summary(orgId, 30).catch(() => null)

    return {
      ok: true,
      period_days: 7,
      settings,
      platforms_configured: creds.length,
      credentials: creds.map((c) => ({
        platform: c.platform,
        key_suffix: c.key_suffix,
        last_test_ok: c.last_test_ok,
        last_tested_at: c.last_tested_at,
        age_days: Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86_400_000),
      })),
      events: {
        total: rows.length,
        by_decision: byDecision,
        by_platform: byPlatform,
        last_event_at: lastEventAt,
      },
      top_tools: Object.entries(byAction)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      usage_30d: summary?.totals ?? {},
    }
  })

  app.get('/v1/orgs/:orgId/connect/settings', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    return getConnectSettings(cfg, orgId)
  })

  app.put('/v1/orgs/:orgId/connect/settings', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const body = z
      .object({
        proxy_mode: z.enum(['gate', 'observe']).optional(),
        wait_verification: z.boolean().optional(),
        wait_timeout_ms: z.number().int().min(5000).max(600_000).optional(),
        gate_tool_results: z.boolean().optional(),
        redact_tool_arguments: z.boolean().optional(),
        notify_on_hold: z.boolean().optional(),
        enforce_action_token: z.boolean().optional(),
        connect_webhook_url: z.string().url().nullable().optional(),
        credential_environment: z.enum(['development', 'staging', 'production']).optional(),
      })
      .parse(req.body)

    const entitlements = getEntitlementEngine(cfg)
    const limits = await entitlements.getLimits(orgId)
    if (body.proxy_mode === 'gate' && !canUseConnectGate(limits)) {
      sendPlanFeatureRequired(
        reply,
        limits,
        'light_gates',
        'Gate mode requires the Personal plan or higher.',
      )
      return
    }
    if (body.connect_webhook_url && !hasPlanFeature(limits, 'webhooks')) {
      sendPlanFeatureRequired(reply, limits, 'webhooks', 'Outbound Connect webhooks require Operator or higher.')
      return
    }

    return upsertConnectSettings(cfg, orgId, body)
  })

  app.get('/v1/orgs/:orgId/connect/policy-presets', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    const settings = await getConnectSettings(cfg, orgId)
    return {
      presets: CONNECT_POLICY_PRESETS.map(({ id, name, description, proxy_mode }) => ({
        id,
        name,
        description,
        proxy_mode,
        active: settings.applied_policy_preset === id,
      })),
      applied: settings.applied_policy_preset,
    }
  })

  app.post('/v1/orgs/:orgId/connect/policy-presets/:presetId/apply', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId, presetId } = req.params as { orgId: string; presetId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const preset = getConnectPreset(presetId)
    if (!preset) return reply.status(404).send({ error: 'preset_not_found' })

    const limits = await getEntitlementEngine(cfg).getLimits(orgId)
    if (preset.proxy_mode === 'gate' && !canUseConnectGate(limits)) {
      sendPlanFeatureRequired(reply, limits, 'light_gates')
      return
    }

    const engine = runtime.getPolicyEngine()
    for (const [action, policy] of Object.entries(preset.policies)) {
      const key = policyStorageKey(action, orgId, [orgId])
      await engine.updatePolicy(key, {
        requiresVerification: policy.requiresVerification,
        autoBlock: policy.autoBlock,
        reasoning: policy.reasoning,
      })
    }

    await upsertConnectSettings(cfg, orgId, {
      proxy_mode: preset.proxy_mode,
      applied_policy_preset: presetId,
    })

    return { ok: true, preset: presetId, policies_applied: Object.keys(preset.policies).length }
  })

  app.get('/v1/orgs/:orgId/connect/suggest-policies', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return

    const tools = await listConnectTools(cfg, orgId, 50)
    const fromRegistry = tools
      .filter((t) => t.suggestion.recommendation !== 'approve')
      .map((t) => ({
        action: t.action,
        count: t.seen_count,
        recommendation: t.suggestion.recommendation === 'block' ? ('block' as const) : ('verify' as const),
        reason: t.suggestion.reason,
      }))

    if (fromRegistry.length > 0) {
      return { suggestions: fromRegistry.slice(0, 15) }
    }

    const admin = (await import('./auth.js')).createSupabaseAdmin(cfg)
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data } = await admin
      .from('audit_events')
      .select('action')
      .eq('org_id', orgId)
      .gte('created_at', since)
      .contains('context', { proxy: true })

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const a = String(row.action ?? '')
      if (a) counts.set(a, (counts.get(a) ?? 0) + 1)
    }

    const sensitive = /send_|delete_|transfer_|execute_|unlock_|admin|password|payment|tool_result/i
    const suggestions = [...counts.entries()]
      .filter(([action]) => sensitive.test(action))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([action, count]) => ({
        action,
        count,
        recommendation: 'verify' as const,
        reason: `Seen ${count} times via Connect — consider requiring verification.`,
      }))

    return { suggestions }
  })

  app.get('/v1/orgs/:orgId/connect/tools', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    const tools = await listConnectTools(cfg, orgId, 100)
    return { tools }
  })

  app.post('/v1/orgs/:orgId/connect/tools/:action/policy', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId, action } = req.params as { orgId: string; action: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const body = z.object({ mode: z.enum(['verify', 'block', 'approve']) }).parse(req.body)
    const limits = await getEntitlementEngine(cfg).getLimits(orgId)
    if (body.mode !== 'approve' && !hasPlanFeature(limits, 'light_gates')) {
      sendPlanFeatureRequired(reply, limits, 'light_gates', 'Per-tool verify/block policies require Personal or higher.')
      return
    }
    const key = policyStorageKey(action, orgId, [orgId])
    const patch =
      body.mode === 'block'
        ? { autoBlock: true, requiresVerification: false, reasoning: `Connect: blocked via Live Feed policy.` }
        : body.mode === 'verify'
          ? { autoBlock: false, requiresVerification: true, reasoning: `Connect: requires verification.` }
          : { autoBlock: false, requiresVerification: false, reasoning: `Connect: auto-approved.` }

    await runtime.getPolicyEngine().updatePolicy(key, patch)
    return { ok: true, action, mode: body.mode }
  })

  app.get('/v1/orgs/:orgId/connect/shield-presets', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    return { presets: CONNECT_SHIELD_PRESETS }
  })

  app.post('/v1/orgs/:orgId/connect/shield-presets/:presetId/apply', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId, presetId } = req.params as { orgId: string; presetId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const bundle = getConnectShieldPreset(presetId)
    if (!bundle) return reply.status(404).send({ error: 'shield_preset_not_found' })

    const limits = await getEntitlementEngine(cfg).getLimits(orgId)
    if (!canUseShieldPresets(limits)) {
      sendPlanFeatureRequired(reply, limits, 'light_gates', 'Shield presets require Personal or higher.')
      return
    }

    const policyPreset = getConnectPreset(bundle.policy_preset_id)
    if (policyPreset) {
      if (policyPreset.proxy_mode === 'gate' && !canUseConnectGate(limits)) {
        sendPlanFeatureRequired(reply, limits, 'light_gates')
        return
      }
      const engine = runtime.getPolicyEngine()
      try {
        for (const [action, policy] of Object.entries(policyPreset.policies)) {
          const key = policyStorageKey(action, orgId, [orgId])
          await engine.updatePolicy(key, {
            requiresVerification: policy.requiresVerification,
            autoBlock: policy.autoBlock,
            reasoning: policy.reasoning,
          })
        }
        await upsertConnectSettings(cfg, orgId, {
          proxy_mode: policyPreset.proxy_mode,
          applied_policy_preset: bundle.policy_preset_id,
        })
      } catch (err) {
        return reply.status(500).send({
          error: 'policy_preset_apply_failed',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const admin = (await import('./auth.js')).createSupabaseAdmin(cfg)
    const bundledPatterns = bundle.shield_rules.map((rule) => rule.actionPattern)
    const bundledLabels = bundle.shield_rules.map((rule) => rule.label)
    if (bundledPatterns.length > 0 && bundledLabels.length > 0) {
      const { error } = await admin
        .from('shield_rules')
        .delete()
        .eq('org_id', orgId)
        .in('action_pattern', bundledPatterns)
        .in('label', bundledLabels)
      if (error) {
        return reply.status(400).send({
          error: 'shield_rules_replace_failed',
          detail: error.message,
          code: error.code,
        })
      }
    }

    const rows = bundle.shield_rules.map((rule) => ({
      org_id: orgId,
      action_pattern: rule.actionPattern,
      label: rule.label,
      response: rule.response,
      category: rule.category ?? null,
      enabled: true,
      created_by: user.email ?? user.id,
    }))
    const { data: insertedRules, error: insertError } = await admin.from('shield_rules').insert(rows).select('id')
    if (insertError) {
      return reply.status(400).send({
        error: 'shield_rules_insert_failed',
        detail: insertError.message,
        code: insertError.code,
      })
    }
    invalidateShieldRulesCache(orgId)
    return {
      ok: true,
      preset: presetId,
      policies_applied: policyPreset ? Object.keys(policyPreset.policies).length : 0,
      shield_rules_created: insertedRules?.length ?? rows.length,
    }
  })

  app.post('/v1/orgs/:orgId/connect/promote-to-gate', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return
    const limits = await getEntitlementEngine(cfg).getLimits(orgId)
    if (!canUseConnectGate(limits)) {
      sendPlanFeatureRequired(reply, limits, 'light_gates')
      return
    }
    return upsertConnectSettings(cfg, orgId, { proxy_mode: 'gate', wait_verification: true })
  })

  app.get('/v1/connect/verifications/:correlationId', async (req, reply) => {
    const agentTokenRaw =
      (req.headers['x-sanctum-agent-token'] as string | undefined) ??
      (req.headers['x-agent-token'] as string | undefined)
    if (!agentTokenRaw) return reply.status(401).send({ error: 'X-Sanctum-Agent-Token required' })
    const claims = verifyAgentToken(agentTokenRaw)
    if (!claims) return reply.status(401).send({ error: 'invalid_agent_token' })

    const { correlationId } = req.params as { correlationId: string }
    const status = runtime.getVerificationStatus(correlationId)
    if (status.status === 'unknown') {
      return reply.status(404).send({ error: 'verification_not_found' })
    }
    return status
  })

  /** Verify before executing a tool locally (returns actionToken when approved). */
  app.post('/v1/connect/verify-execution', async (req, reply) => {
    const agentTokenRaw =
      (req.headers['x-sanctum-agent-token'] as string | undefined) ??
      (req.headers['x-agent-token'] as string | undefined)
    if (!agentTokenRaw) {
      return reply.status(401).send({ error: 'X-Sanctum-Agent-Token required' })
    }
    const claims = verifyAgentToken(agentTokenRaw)
    if (!claims) return reply.status(401).send({ error: 'invalid_agent_token' })

    const body = z
      .object({
        action: z.string().min(1).max(512),
        arguments: z.record(z.string(), z.unknown()).optional(),
        platform: z.string().optional(),
        tool_call_id: z.string().optional(),
        wait_verification: z.boolean().optional(),
      })
      .parse(req.body)

    const admin = (await import('./auth.js')).createSupabaseAdmin(cfg)
    const { data: agentRow } = await admin
      .from('agent_registrations')
      .select('name')
      .eq('id', claims.id)
      .maybeSingle()
    const agentName = agentRow?.name ?? claims.id.slice(0, 8)
    const settings = await getConnectSettings(cfg, claims.orgId)
    const entitlements = getEntitlementEngine(cfg)
    const limits = await entitlements.getLimits(claims.orgId)
    if (!canUseConnectGate(limits)) {
      sendPlanFeatureRequired(reply, limits, 'light_gates', 'Local execution verify requires gate-capable plans (Personal+).')
      return
    }
    const quotaBlocked = await governedQuotaBlock(entitlements, claims.orgId, {
      actor: agentName,
      action: body.action,
      context: { org_id: claims.orgId, platform: body.platform ?? 'connect' },
    })
    if (quotaBlocked) {
      return reply.status(403).send({
        error: 'quota_exceeded',
        decision: quotaBlocked.decision,
        reasoning: quotaBlocked.reasoning,
      })
    }

    const toolCall = {
      id: body.tool_call_id ?? `exec-${Date.now()}`,
      name: body.action,
      arguments: JSON.stringify(body.arguments ?? {}),
    }

    const result = await gateProxyToolCall(app, runtime, {
      agentToken: agentTokenRaw,
      agentId: claims.id,
      agentName,
      orgId: claims.orgId,
      platform: body.platform ?? 'connect',
      toolCall,
      waitVerification: body.wait_verification ?? settings.wait_verification,
      waitTimeoutMs: settings.wait_timeout_ms,
      phase: 'execution',
    })

    if (!result.allowed) {
      return reply.status(403).send({
        error: 'action_not_allowed',
        decision: result.entry.decision,
        reasoning: result.reason,
        entry: result.entry,
      })
    }

    if (settings.enforce_action_token && !result.entry.actionToken) {
      return reply.status(403).send({
        error: 'action_token_required',
        decision: result.entry.decision,
        reasoning: 'Org requires a signed action token before local execution.',
      })
    }

    return {
      ok: true,
      decision: result.entry.decision,
      entry: result.entry,
      actionToken: result.entry.actionToken ?? null,
    }
  })

  app.post('/v1/orgs/:orgId/connect/test-run', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'member', reply))) return

    const body = z
      .object({
        agent_id: z.string().uuid(),
        platform: z.string().optional(),
      })
      .parse(req.body ?? {})

    const admin = (await import('./auth.js')).createSupabaseAdmin(cfg)
    const { data: agentRow, error: agentError } = await admin
      .from('agent_registrations')
      .select('id,name')
      .eq('id', body.agent_id)
      .eq('org_id', orgId)
      .is('revoked_at', null)
      .maybeSingle()
    if (agentError) {
      return reply.status(502).send({ error: 'agent_lookup_failed', detail: agentError.message })
    }
    if (!agentRow) {
      return reply.status(404).send({ error: 'agent_not_found' })
    }

    const agentToken = issueAgentToken(body.agent_id, orgId)
    const testAction = 'connect_verify_test_tool_call'
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/actions/verify',
      headers: {
        'content-type': 'application/json',
        'x-sanctum-agent-token': agentToken,
      },
      payload: {
        actor: `connect-test-${agentRow.name ?? body.agent_id.slice(0, 8)}`,
        action: testAction,
        context: {
          org_id: orgId,
          proxy: true,
          platform: body.platform ?? 'connect',
          test: true,
          dryRun: true,
          toolName: 'send_status_email',
          instructionSource: 'trusted_user',
          dataSensitivity: 'internal',
          destination: 'operator@example.com',
          blastRadius: {
            score: 12,
            reversibility: 'high',
            externalRecipient: true,
          },
        },
      },
    })

    let entry: Record<string, unknown> = {}
    try {
      entry = JSON.parse(verifyRes.payload as string) as Record<string, unknown>
    } catch {
      // ignore
    }
    const reasoning =
      typeof entry.reasoning === 'string'
        ? entry.reasoning
        : typeof entry.error === 'string'
          ? entry.error
          : typeof entry.message === 'string'
            ? entry.message
            : undefined
    return {
      ok: verifyRes.statusCode >= 200 && verifyRes.statusCode < 300,
      status: verifyRes.statusCode,
      action: testAction,
      decision: entry.decision,
      reasoning,
    }
  })

  app.get('/v1/orgs/:orgId/connect/held-count', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    const held = await countHeldConnectEvents(cfg, orgId)
    return { ok: true, held, org_id: orgId }
  })

  app.get('/v1/orgs/:orgId/connect/live-feed', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
        decision: z.string().optional(),
        platform: z.string().optional(),
        action: z.string().optional(),
        agent_id: z.string().optional(),
        held_only: z.coerce.boolean().optional(),
      })
      .parse(req.query ?? {})
    const events = await listConnectProxyEvents(cfg, orgId, {
      limit: q.limit,
      decision: q.decision,
      platform: q.platform,
      action: q.action,
      agentId: q.agent_id,
      heldOnly: q.held_only,
    })
    return { ok: true, events, count: events.length }
  })

  app.get('/v1/orgs/:orgId/audit', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        decision: z.string().optional(),
        actor: z.string().optional(),
        action: z.string().optional(),
        search: z.string().optional(),
        held_only: z.coerce.boolean().optional(),
        high_risk: z.coerce.boolean().optional(),
      })
      .parse(req.query ?? {})
    const entitlements = getEntitlementEngine(cfg)
    const limits = await entitlements.getLimits(orgId)
    const page = await listOrgAuditPage(
      cfg,
      orgId,
      {
        limit: q.limit,
        cursor: q.cursor,
        decision: q.decision,
        actor: q.actor,
        action: q.action,
        search: q.search,
        heldOnly: q.held_only,
        highRiskOnly: q.high_risk,
      },
      limits.retentionDays ?? 30,
    )
    return {
      entries: page.entries,
      nextCursor: page.nextCursor,
      totalApprox: page.totalApprox,
      retentionDays: page.retentionDays,
    }
  })

  app.get('/v1/orgs/:orgId/connect/live-feed/stream', async (req, reply) => {
    const user = (req as SanctumReq).sanctumUser
    if (!user) return reply.status(403).send({ error: 'dashboard_auth_required' })
    const { orgId } = req.params as { orgId: string }
    if (!(await requireRole(cfg, orgId, user.id, 'viewer', reply))) return

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    let lastPayload = ''
    const tick = async () => {
      try {
        const [events, held] = await Promise.all([
          listConnectProxyEvents(cfg, orgId, { limit: 80 }),
          countHeldConnectEvents(cfg, orgId),
        ])
        const payload = JSON.stringify({ events, held, at: new Date().toISOString() })
        if (payload !== lastPayload) {
          lastPayload = payload
          reply.raw.write(`data: ${payload}\n\n`)
        } else {
          reply.raw.write(`: ping ${Date.now()}\n\n`)
        }
      } catch {
        reply.raw.write(`event: error\ndata: {"message":"tick_failed"}\n\n`)
      }
    }

    await tick()
    const interval = setInterval(tick, 2000)
    req.raw.on('close', () => clearInterval(interval))
  })
}
