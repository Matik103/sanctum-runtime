import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export const ROLE_RANK: Record<OrgRole, number> = {
  owner: 100,
  admin: 75,
  member: 50,
  viewer: 10,
}

/**
 * Look up a user's role in an org. Returns null if the user is not a member.
 */
export async function checkOrgRole(
  cfg: SupabaseAuthConfig,
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  const admin = createSupabaseAdmin(cfg)
  const { data, error } = await admin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return null

  const role = data.role as OrgRole
  if (!(role in ROLE_RANK)) return null
  return role
}

/**
 * Returns true if `actual` satisfies the `required` minimum role.
 */
export function hasRole(actual: OrgRole | null, required: OrgRole): boolean {
  if (actual === null) return false
  return ROLE_RANK[actual] >= ROLE_RANK[required]
}

/**
 * Asserts that a user has at least `required` role in `orgId`.
 * Throws an Error with `statusCode: 403` and `error: 'insufficient_role'` if not.
 */
export async function assertOrgRole(
  cfg: SupabaseAuthConfig,
  orgId: string,
  userId: string,
  required: OrgRole,
): Promise<void> {
  const actual = await checkOrgRole(cfg, orgId, userId)
  if (!hasRole(actual, required)) {
    const err = new Error('insufficient_role') as Error & {
      statusCode: number
      error: string
    }
    err.statusCode = 403
    err.error = 'insufficient_role'
    throw err
  }
}
