import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { assertOrgRole, type OrgRole } from './rbac.js'

export type PolicyMap = Record<string, unknown>

export type PolicySnapshot = {
  id: string
  org_id: string
  snapshot: PolicyMap
  created_by_user_id: string
  created_at: string
  label?: string | null
  change_summary?: string | null
}

type SanctumReq = import('fastify').FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

function headerKey(req: SanctumReq): string | undefined {
  const raw = req.headers['x-sanctum-key']
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Saves the current policy map as a versioned snapshot.
 * Returns the new snapshot's ID.
 */
export async function savePolicySnapshot(
  cfg: SupabaseAuthConfig,
  orgId: string,
  policies: PolicyMap,
  userId: string,
  label?: string,
  changeSummary?: string,
): Promise<string> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('policy_snapshots')
    .insert({
      org_id: orgId,
      snapshot: policies,
      created_by_user_id: userId,
      label: label ?? null,
      change_summary: changeSummary ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to save policy snapshot: ${error?.message ?? 'unknown error'}`)
  }
  return data.id as string
}

/**
 * Lists policy snapshots for an org, newest first.
 */
export async function listPolicySnapshots(
  cfg: SupabaseAuthConfig,
  orgId: string,
  limit = 50,
): Promise<PolicySnapshot[]> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('policy_snapshots')
    .select('id,org_id,snapshot,created_by_user_id,created_at,label,change_summary')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 200))

  if (error) throw new Error(`Failed to list policy snapshots: ${error.message}`)
  return (data ?? []) as PolicySnapshot[]
}

/**
 * Fetches a single policy snapshot by ID, scoped to an org.
 * Returns null if not found or org mismatch.
 */
export async function getPolicySnapshot(
  cfg: SupabaseAuthConfig,
  snapshotId: string,
  orgId: string,
): Promise<PolicySnapshot | null> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('policy_snapshots')
    .select('id,org_id,snapshot,created_by_user_id,created_at,label,change_summary')
    .eq('id', snapshotId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw new Error(`Failed to get policy snapshot: ${error.message}`)
  return (data as PolicySnapshot | null)
}

/**
 * Registers policy version routes on the Fastify app.
 *
 * Routes:
 *   GET  /v1/orgs/:orgId/policy-snapshots              — list snapshots (member+)
 *   POST /v1/orgs/:orgId/policy-snapshots              — save snapshot (admin+)
 *   GET  /v1/orgs/:orgId/policy-snapshots/:snapshotId  — get single snapshot (member+)
 *   POST /v1/orgs/:orgId/policy-snapshots/:snapshotId/restore — restore (admin+)
 */
export async function registerPolicyVersionRoutes(
  app: FastifyInstance,
  cfg: SupabaseAuthConfig,
): Promise<void> {
  const store = new ControlPlaneStore(cfg)
  const orgIdSchema = z.string().min(1).max(128)
  const snapshotIdSchema = z.string().uuid()

  async function resolveAccess(
    req: SanctumReq,
    orgId: string,
    minRole: OrgRole,
  ): Promise<{ ok: boolean; userId?: string }> {
    if (req.sanctumUser) {
      try {
        await assertOrgRole(cfg, orgId, req.sanctumUser.id, minRole)
        return { ok: true, userId: req.sanctumUser.id }
      } catch {
        return { ok: false }
      }
    }
    const key = headerKey(req)
    if (key?.startsWith('sk_sanctum_')) {
      const keyOrg = await store.getApiKeyOrgId(key)
      if (keyOrg !== orgId) return { ok: false }
      // Dashboard API keys are org-scoped admin credentials
      return { ok: true, userId: undefined }
    }
    return { ok: false }
  }

  // GET /v1/orgs/:orgId/policy-snapshots
  app.get('/v1/orgs/:orgId/policy-snapshots', async (req, reply) => {
    const orgId = orgIdSchema.parse((req.params as { orgId: string }).orgId)
    const access = await resolveAccess(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const q = req.query as { limit?: string }
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50) || 50))
    const snapshots = await listPolicySnapshots(cfg, orgId, limit)
    return snapshots
  })

  // POST /v1/orgs/:orgId/policy-snapshots
  app.post('/v1/orgs/:orgId/policy-snapshots', async (req, reply) => {
    const orgId = orgIdSchema.parse((req.params as { orgId: string }).orgId)
    const access = await resolveAccess(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const body = z.object({
      label: z.string().max(256).optional(),
      change_summary: z.string().max(2048).optional(),
    }).parse(req.body)

    // Fetch current policies for this org from the runtime_policies table
    const admin = createSupabaseAdmin(cfg)
    const { data: policyRows, error: policyErr } = await admin
      .from('runtime_policies')
      .select('action,config')
      .eq('org_id', orgId)

    if (policyErr) {
      return reply.status(500).send({ error: 'failed_to_fetch_policies', detail: policyErr.message })
    }

    // Build a PolicyMap: { [action]: config }
    const policies: PolicyMap = {}
    for (const row of policyRows ?? []) {
      policies[row.action as string] = row.config
    }

    const snapshotId = await savePolicySnapshot(
      cfg,
      orgId,
      policies,
      access.userId ?? '00000000-0000-0000-0000-000000000000',
      body.label,
      body.change_summary,
    )

    return reply.status(201).send({ id: snapshotId, org_id: orgId, policy_count: Object.keys(policies).length })
  })

  // GET /v1/orgs/:orgId/policy-snapshots/:snapshotId
  app.get('/v1/orgs/:orgId/policy-snapshots/:snapshotId', async (req, reply) => {
    const { orgId, snapshotId } = req.params as { orgId: string; snapshotId: string }
    orgIdSchema.parse(orgId)
    snapshotIdSchema.parse(snapshotId)

    const access = await resolveAccess(req as SanctumReq, orgId, 'member')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const snapshot = await getPolicySnapshot(cfg, snapshotId, orgId)
    if (!snapshot) return reply.status(404).send({ error: 'snapshot_not_found' })
    return snapshot
  })

  // POST /v1/orgs/:orgId/policy-snapshots/:snapshotId/restore
  app.post('/v1/orgs/:orgId/policy-snapshots/:snapshotId/restore', async (req, reply) => {
    const { orgId, snapshotId } = req.params as { orgId: string; snapshotId: string }
    orgIdSchema.parse(orgId)
    snapshotIdSchema.parse(snapshotId)

    const access = await resolveAccess(req as SanctumReq, orgId, 'admin')
    if (!access.ok) return reply.status(403).send({ error: 'org_forbidden' })

    const snapshot = await getPolicySnapshot(cfg, snapshotId, orgId)
    if (!snapshot) return reply.status(404).send({ error: 'snapshot_not_found' })

    const admin = createSupabaseAdmin(cfg)
    const policies = snapshot.snapshot as PolicyMap

    // Delete all existing policies for this org, then re-insert from snapshot
    const { error: deleteErr } = await admin
      .from('runtime_policies')
      .delete()
      .eq('org_id', orgId)

    if (deleteErr) {
      return reply.status(500).send({ error: 'restore_delete_failed', detail: deleteErr.message })
    }

    const rows = Object.entries(policies).map(([action, config]) => ({
      org_id: orgId,
      action,
      config,
      updated_at: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error: insertErr } = await admin
        .from('runtime_policies')
        .insert(rows)

      if (insertErr) {
        return reply.status(500).send({ error: 'restore_insert_failed', detail: insertErr.message })
      }
    }

    // Record a new snapshot to document the restore event
    const restoreSnapshotId = await savePolicySnapshot(
      cfg,
      orgId,
      policies,
      access.userId ?? '00000000-0000-0000-0000-000000000000',
      `Restored from snapshot ${snapshotId}`,
      `Automated snapshot created during restore of ${snapshotId}${snapshot.label ? ` ("${snapshot.label}")` : ''}`,
    )

    return {
      ok: true,
      restored_from: snapshotId,
      new_snapshot_id: restoreSnapshotId,
      policy_count: rows.length,
    }
  })
}
