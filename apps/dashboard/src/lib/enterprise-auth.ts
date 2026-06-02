import type { SupabaseClient, User } from '@supabase/supabase-js'
import { applyOauthIntent } from './oauth'
import { fetchMyOrgs, type FleetOrg } from './fleet'

export type EnterpriseAuthState = {
  portalType: 'operator' | 'enterprise' | null
  orgs: FleetOrg[]
  joinedOrgId: string | null
}

/** Run after OAuth redirect: metadata + domain-based org membership. */
export async function completeEnterpriseSignIn(
  sb: SupabaseClient,
  user: User,
): Promise<EnterpriseAuthState> {
  await applyOauthIntent(sb, user)

  let joinedOrgId: string | null = null
  const { data: bootOrg, error: bootErr } = await sb.rpc('bootstrap_enterprise_org_for_user')
  if (bootErr) {
    if (import.meta.env.DEV) {
      console.warn('[enterprise-auth] bootstrap_enterprise_org_for_user failed')
    }
  } else if (typeof bootOrg === 'string' && bootOrg.length > 0) {
    joinedOrgId = bootOrg
  }

  const { data: profile } = await sb.from('my_profile').select('portal_type').maybeSingle()
  const portalType =
    (profile?.portal_type as 'operator' | 'enterprise' | undefined) ??
    (user.user_metadata?.portal_type as 'operator' | 'enterprise' | undefined) ??
    null

  const orgs = await fetchMyOrgs()

  return { portalType, orgs, joinedOrgId }
}
