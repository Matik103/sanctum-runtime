import type { FastifyReply } from 'fastify'
import type { PolicyMap } from '@sanctum-runtime/sdk'
import type { ActionResult } from '@sanctum-runtime/sdk'
import type { RuntimeEngine } from '@sanctum/runtime-engine'
import { DEFAULT_POLICIES } from '@sanctum/policy-engine'
import { ControlPlaneStore } from './control-plane-store.js'
import { assertOrgAllowed, resolveOrgScope, type SanctumReq } from './org-scope.js'
import { isProduction } from './security.js'
import type { SupabaseAuthConfig } from './auth.js'

let storeSingleton: ControlPlaneStore | null = null

function getStore(supabase: SupabaseAuthConfig | null): ControlPlaneStore | null {
  if (!supabase) return null
  storeSingleton ??= new ControlPlaneStore(supabase)
  return storeSingleton
}

export async function resolveRouteOrgScope(
  req: SanctumReq,
  supabase: SupabaseAuthConfig | null,
): Promise<string[] | null> {
  const store = getStore(supabase)
  if (store) return resolveOrgScope(req, store)
  if (!isProduction()) return null
  const bound = process.env.SANCTUM_LEGACY_KEY_ORG_ID?.trim()
  return bound ? [bound] : []
}

export function pickScopedOrgs(
  scope: string[] | null,
  explicitOrgId: string | undefined,
  opts: { requireSingle?: boolean } = {},
): { orgIds: string[] } | { status: number; body: { error: string } } {
  if (scope === null) {
    return { orgIds: explicitOrgId ? [explicitOrgId] : [] }
  }
  if (scope.length === 0) {
    return { status: 403, body: { error: 'org_forbidden' } }
  }
  if (explicitOrgId) {
    if (!scope.includes(explicitOrgId)) {
      return { status: 403, body: { error: 'org_forbidden' } }
    }
    return { orgIds: [explicitOrgId] }
  }
  if (opts.requireSingle && scope.length > 1) {
    return { status: 400, body: { error: 'org_id_required' } }
  }
  return { orgIds: scope }
}

export function policyStorageKey(
  action: string,
  orgId: string | undefined,
  scope: string[] | null,
): string {
  if (scope === null || !orgId) return action
  return `${orgId}:${action}`
}

export function mergePoliciesForOrgs(
  runtime: RuntimeEngine,
  orgIds: string[],
): PolicyMap {
  const merged: PolicyMap = { ...DEFAULT_POLICIES }
  for (const orgId of orgIds) {
    Object.assign(merged, runtime.getPoliciesForOrg(orgId))
  }
  return merged
}

export async function listScopedAudit(
  runtime: RuntimeEngine,
  limit: number,
  orgIds: string[],
  scope: string[] | null,
): Promise<ActionResult[]> {
  if (scope === null && orgIds.length === 0) {
    return runtime.listAudit(limit)
  }
  if (orgIds.length === 0) {
    return runtime.listAudit(limit)
  }
  if (orgIds.length === 1) {
    return runtime.listAudit(limit, orgIds[0])
  }
  const perOrg = Math.max(1, Math.floor(limit / orgIds.length))
  const rows: ActionResult[] = []
  for (const orgId of orgIds) {
    rows.push(...(await runtime.listAudit(perOrg, orgId)))
  }
  rows.sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
  return rows.slice(0, limit)
}

export function assertAuditEntryScope(
  scope: string[] | null,
  entryOrgId: string | undefined,
  reply: FastifyReply,
): boolean {
  if (scope === null || !entryOrgId) return true
  return assertOrgAllowed(scope, entryOrgId, reply)
}
