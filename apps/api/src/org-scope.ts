import type { FastifyReply, FastifyRequest } from 'fastify'
import { isProduction } from './security.js'
import type { ControlPlaneStore } from './control-plane-store.js'

export type SanctumReq = FastifyRequest & {
  sanctumUser?: { id: string; email?: string }
}

export function headerKey(req: SanctumReq): string | undefined {
  const raw = req.headers['x-sanctum-key']
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Org IDs the caller may access. null = unrestricted (local dev only).
 * Production never returns null — legacy env key must use SANCTUM_LEGACY_KEY_ORG_ID.
 */
export async function resolveOrgScope(
  req: SanctumReq,
  store: ControlPlaneStore,
): Promise<string[] | null> {
  if (req.sanctumUser) return store.getUserOrgIds(req.sanctumUser.id)

  const key = headerKey(req)
  if (key?.startsWith('sk_sanctum_')) {
    const orgId = await store.getApiKeyOrgId(key)
    return orgId ? [orgId] : []
  }

  if (!isProduction()) return null

  const bound = process.env.SANCTUM_LEGACY_KEY_ORG_ID?.trim()
  return bound ? [bound] : []
}

export function assertOrgAllowed(
  scope: string[] | null,
  orgId: string,
  reply: FastifyReply,
): boolean {
  if (scope === null) return true
  if (!scope.includes(orgId)) {
    reply.status(403).send({ error: 'org_forbidden' })
    return false
  }
  return true
}

export function filterByScope<T extends { org_id: string }>(
  rows: T[],
  scope: string[] | null,
): T[] {
  if (scope === null) return rows
  return rows.filter((r) => scope.includes(r.org_id))
}
