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
import { verifyAgentToken } from './agent-tokens.js'
import { gateProxyToolCall } from './proxy-gate.js'
import { listPlatformCredentials } from './platform-credentials.js'
import { UsageStore } from './usage-store.js'
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
      })
      .parse(req.body)

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

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/actions/verify',
      headers: { 'content-type': 'application/json' },
      payload: {
        actor: `connect-test-${body.agent_id.slice(0, 8)}`,
        action: 'connect_health_check',
        context: {
          org_id: orgId,
          proxy: true,
          platform: body.platform ?? 'connect',
          test: true,
        },
      },
    })

    let entry: Record<string, unknown> = {}
    try {
      entry = JSON.parse(verifyRes.payload as string) as Record<string, unknown>
    } catch {
      // ignore
    }
    return {
      ok: verifyRes.statusCode === 200,
      status: verifyRes.statusCode,
      decision: entry.decision,
      reasoning: entry.reasoning,
    }
  })
}
