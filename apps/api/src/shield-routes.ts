/**
 * Sanctum Shield — operator rule management and containment API.
 *
 * Lets operators:
 *  - view, create, update, and delete custom Shield action rules
 *  - query the containment event log
 *  - resolve (acknowledge) containment events
 *
 * Custom rules are evaluated deterministically at /v1/actions/verify before
 * the AI risk model runs, giving operators direct control over high-stakes
 * action categories.
 *
 * The per-org shield rules are also exported so the verify endpoint can
 * apply them without importing the full route file.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { logger } from './logger.js'

const log = logger.child({ module: 'shield-routes' })

type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
  sanctumApiKeyScope?: string[]
}

function headerKey(req: FastifyRequest): string | undefined {
  const v = req.headers['x-sanctum-key']
  return Array.isArray(v) ? v[0] : v
}

async function resolveOrgId(req: SanctumReq, store: ControlPlaneStore): Promise<string | null> {
  let orgIds: string[] | null = null
  if (req.sanctumUser) {
    orgIds = await store.getUserOrgIds(req.sanctumUser.id)
  } else if (req.sanctumApiKeyScope !== undefined) {
    orgIds = req.sanctumApiKeyScope
  } else {
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const oid = await store.getApiKeyOrgId(key)
      if (oid) orgIds = [oid]
    }
  }
  return orgIds?.[0] ?? null
}

// ── Zod schemas ─────────────────────────────────────────────────────────────

const ShieldRuleBodySchema = z.object({
  actionPattern: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  response: z.enum(['BLOCK', 'REQUIRE_VERIFICATION', 'LOG_ONLY']),
  category: z.enum(['financial', 'security', 'physical', 'data', 'infrastructure', 'ai', 'other']).optional(),
  minAmount: z.number().positive().optional(),
  conditions: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
})

const ContainmentQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  unresolvedOnly: z.coerce.boolean().default(false),
})

// ── Route registration ───────────────────────────────────────────────────────

export function registerShieldRoutes(app: FastifyInstance): void {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return // Shield rules require Supabase; no-op in standalone mode

  const store = new ControlPlaneStore(cfg)

  // ── GET /v1/shield/rules ─────────────────────────────────────────────────
  app.get('/v1/shield/rules', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('shield_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      log.error({ err: error, orgId }, 'Failed to fetch shield rules')
      return reply.code(500).send({ error: 'Failed to fetch rules' })
    }
    return { rules: data }
  })

  // ── POST /v1/shield/rules ────────────────────────────────────────────────
  app.post('/v1/shield/rules', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const parsed = ShieldRuleBodySchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const d = parsed.data
    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('shield_rules')
      .insert({
        org_id: orgId,
        action_pattern: d.actionPattern,
        label: d.label,
        response: d.response,
        category: d.category ?? null,
        min_amount: d.minAmount ?? null,
        conditions: d.conditions ?? null,
        enabled: d.enabled,
        created_by: (req as SanctumReq).sanctumUser?.email ?? (req as SanctumReq).sanctumUser?.id ?? 'operator',
      })
      .select()
      .single()

    if (error) {
      log.error({ err: error, orgId }, 'Failed to create shield rule')
      return reply.code(500).send({ error: 'Failed to create rule' })
    }
    invalidateShieldRulesCache(orgId)
    return reply.code(201).send({ rule: data })
  })

  // ── PATCH /v1/shield/rules/:id ───────────────────────────────────────────
  app.patch('/v1/shield/rules/:id', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const { id } = req.params as { id: string }
    const parsed = ShieldRuleBodySchema.partial().safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const p = parsed.data
    if (p.actionPattern !== undefined) updates['action_pattern'] = p.actionPattern
    if (p.label !== undefined)         updates['label'] = p.label
    if (p.response !== undefined)      updates['response'] = p.response
    if (p.category !== undefined)      updates['category'] = p.category
    if (p.minAmount !== undefined)     updates['min_amount'] = p.minAmount
    if (p.conditions !== undefined)    updates['conditions'] = p.conditions
    if (p.enabled !== undefined)       updates['enabled'] = p.enabled

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('shield_rules')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error || !data) {
      return reply.code(error ? 500 : 404).send({ error: error ? 'Failed to update rule' : 'Rule not found' })
    }
    invalidateShieldRulesCache(orgId)
    return { rule: data }
  })

  // ── DELETE /v1/shield/rules/:id ──────────────────────────────────────────
  app.delete('/v1/shield/rules/:id', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const { id } = req.params as { id: string }
    const admin = createSupabaseAdmin(cfg)
    const { error } = await admin
      .from('shield_rules')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      log.error({ err: error, orgId, id }, 'Failed to delete shield rule')
      return reply.code(500).send({ error: 'Failed to delete rule' })
    }
    invalidateShieldRulesCache(orgId)
    return reply.code(204).send()
  })

  // ── GET /v1/shield/containment ───────────────────────────────────────────
  app.get('/v1/shield/containment', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const parsed = ContainmentQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const admin = createSupabaseAdmin(cfg)
    let query = admin
      .from('shield_containment_events')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(parsed.data.limit)

    if (parsed.data.unresolvedOnly) {
      query = query.eq('resolved', false)
    }

    const { data, error } = await query
    if (error) {
      log.error({ err: error, orgId }, 'Failed to fetch containment events')
      return reply.code(500).send({ error: 'Failed to fetch containment events' })
    }
    return { events: data }
  })

  // ── POST /v1/shield/containment/:id/resolve ──────────────────────────────
  app.post('/v1/shield/containment/:id/resolve', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const { id } = req.params as { id: string }
    const body = req.body as { note?: string } | null
    const user = (req as SanctumReq).sanctumUser

    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('shield_containment_events')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.email ?? user?.id ?? 'operator',
        resolution_note: body?.note ?? null,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error || !data) {
      return reply.code(error ? 500 : 404).send({ error: error ? 'Failed to resolve event' : 'Event not found' })
    }
    return { event: data }
  })

  // ── GET /v1/shield/status ────────────────────────────────────────────────
  // Fleet pause state + unresolved incident count — no Supabase tables required
  // to return something useful; gracefully degrades if table is absent.
  app.get('/v1/shield/status', async (req, reply) => {
    const orgId = await resolveOrgId(req as SanctumReq, store)
    if (!orgId) return reply.code(401).send({ error: 'Unauthorized' })

    const admin = createSupabaseAdmin(cfg)
    const [orgRes, unresolvedRes] = await Promise.all([
      admin
        .from('organizations')
        .select('fleet_paused, fleet_paused_at, fleet_paused_by')
        .eq('id', orgId)
        .single(),
      admin
        .from('shield_containment_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('resolved', false)
        .then((r) => r)
        .catch(() => ({ count: 0 })),
    ])

    return {
      fleetPaused: !!orgRes.data?.fleet_paused,
      fleetPausedAt: orgRes.data?.fleet_paused_at ?? null,
      fleetPausedBy: orgRes.data?.fleet_paused_by ?? null,
      unresolvedIncidents: (unresolvedRes as { count?: number }).count ?? 0,
    }
  })
}

// ── Custom rule evaluation (imported by verify endpoint) ─────────────────────

export type ShieldRuleRow = {
  id: string
  action_pattern: string
  response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'
  min_amount: number | null
  conditions: Record<string, unknown> | null
  enabled: boolean
  label: string
}

/**
 * Evaluate custom Shield rules against an incoming action.
 *
 * Returns the *strongest* matching rule response, or null if no rule fires.
 * Strength order: BLOCK > REQUIRE_VERIFICATION > LOG_ONLY
 */
export function evaluateShieldRules(
  rules: ShieldRuleRow[],
  action: string,
  context: Record<string, unknown>,
): { response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'; matchedRule: ShieldRuleRow } | null {
  const STRENGTH: Record<string, number> = { BLOCK: 3, REQUIRE_VERIFICATION: 2, LOG_ONLY: 1 }
  let best: { response: 'BLOCK' | 'REQUIRE_VERIFICATION' | 'LOG_ONLY'; matchedRule: ShieldRuleRow } | null = null

  for (const rule of rules) {
    if (!rule.enabled) continue

    // Pattern matching: exact match or glob-prefix (e.g. "transfer_*" matches "transfer_funds")
    const pattern = rule.action_pattern
    const matches =
      pattern === action ||
      (pattern.endsWith('*') && action.startsWith(pattern.slice(0, -1)))

    if (!matches) continue

    // Optional amount threshold (financial rules)
    if (rule.min_amount !== null) {
      const amount = typeof context['amount'] === 'number' ? context['amount'] : null
      if (amount === null || amount < rule.min_amount) continue
    }

    // Optional key/value conditions
    if (rule.conditions) {
      const passes = Object.entries(rule.conditions).every(([k, v]) => context[k] === v)
      if (!passes) continue
    }

    if (!best || STRENGTH[rule.response] > STRENGTH[best.response]) {
      best = { response: rule.response, matchedRule: rule }
    }
  }

  return best
}

// ── In-process rule cache ─────────────────────────────────────────────────────
// Shield rules change rarely (only when an operator edits them in the dashboard).
// Fetching from Supabase on every /v1/actions/verify call adds ~20–40 ms of DB
// latency under load.  A 30-second TTL cache keeps rules fresh enough for any
// operator change to take effect within half a minute while eliminating the DB
// hit on the hot path.

type CacheEntry = { rules: ShieldRuleRow[]; expiresAt: number }
const ruleCache = new Map<string, CacheEntry>()
const RULE_CACHE_TTL_MS = 30_000

/** Invalidate the cached rules for an org (called after any write to shield_rules). */
export function invalidateShieldRulesCache(orgId: string): void {
  ruleCache.delete(orgId)
}

/**
 * Load an org's enabled Shield rules, with a 30-second in-process cache.
 * Returns empty array if the table doesn't exist yet (e.g. migration not yet
 * applied on a self-hosted instance).
 */
export async function loadShieldRules(orgId: string): Promise<ShieldRuleRow[]> {
  const cached = ruleCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) return cached.rules

  const cfg = getSupabaseAuthConfig()
  if (!cfg) return []
  try {
    const admin = createSupabaseAdmin(cfg)
    const { data, error } = await admin
      .from('shield_rules')
      .select('id, action_pattern, response, min_amount, conditions, enabled, label')
      .eq('org_id', orgId)
      .eq('enabled', true)

    if (error) return []
    const rules = (data ?? []) as ShieldRuleRow[]
    ruleCache.set(orgId, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS })
    return rules
  } catch {
    return []
  }
}

/**
 * Persist a containment event to the log.  Fire-and-forget — a failure here
 * must never block the action decision response.
 */
export async function logContainmentEvent(params: {
  orgId: string
  auditId?: string
  actor: string
  action: string
  shieldLevel: 'elevated' | 'high' | 'critical'
  shieldScore: number
  signals: string[]
  automaticResponse: string[]
}): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return
  try {
    const admin = createSupabaseAdmin(cfg)
    await admin.from('shield_containment_events').insert({
      org_id: params.orgId,
      audit_id: params.auditId,
      actor: params.actor,
      action: params.action,
      shield_level: params.shieldLevel,
      shield_score: params.shieldScore,
      signals: params.signals,
      automatic_response: params.automaticResponse,
    })
  } catch (err) {
    log.warn({ err, orgId: params.orgId }, 'Could not persist containment event')
  }
}
