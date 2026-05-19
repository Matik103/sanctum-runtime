import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type PolicyGrant = {
  id: string
  org_id: string
  action: string
  actor: string | null
  granted_by: string
  duration_minutes: number
  expires_at: string
  created_at: string
}

/** Returns the first active grant for this org+action+actor, or null. */
export async function checkActiveGrant(
  cfg: SupabaseAuthConfig,
  orgId: string,
  action: string,
  actor: string,
): Promise<PolicyGrant | null> {
  const admin = createSupabaseAdmin(cfg)
  // Sanitize actor to prevent PostgREST filter injection — strip any chars that
  // are meaningful in PostgREST's filter syntax before embedding in .or()
  const safeActor = actor.replace(/[",\\]/g, '')
  const { data } = await admin
    .from('policy_grants')
    .select('*')
    .eq('org_id', orgId)
    .eq('action', action)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(`actor.is.null,actor.eq."${safeActor}"`)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PolicyGrant | null) ?? null
}

/** Create a time-bounded approval grant. */
export async function createGrant(
  cfg: SupabaseAuthConfig,
  orgId: string,
  action: string,
  actor: string | null,
  grantedBy: string,
  durationMinutes: number,
): Promise<PolicyGrant> {
  const admin = createSupabaseAdmin(cfg)
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString()
  const { data, error } = await admin
    .from('policy_grants')
    .insert({
      org_id: orgId,
      action,
      actor: actor ?? null,
      granted_by: grantedBy,
      duration_minutes: durationMinutes,
      expires_at: expiresAt,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create grant')
  return data as PolicyGrant
}

/** List active grants for an org. */
export async function listActiveGrants(
  cfg: SupabaseAuthConfig,
  orgId: string,
): Promise<PolicyGrant[]> {
  const admin = createSupabaseAdmin(cfg)
  const { data } = await admin
    .from('policy_grants')
    .select('*')
    .eq('org_id', orgId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  return (data ?? []) as PolicyGrant[]
}
