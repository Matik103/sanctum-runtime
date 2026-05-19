import type { SupabaseClient, User } from '@supabase/supabase-js'

const PORTAL_KEY = 'sanctum_oauth_portal'
const PROVIDER_KEY = 'sanctum_oauth_provider'

export type OauthPortal = 'operator' | 'enterprise'
export type OauthProvider = 'google' | 'github'

/** Remember intent across the OAuth redirect (sessionStorage survives same-tab return). */
export function markOauthIntent(portal: OauthPortal, provider: OauthProvider): void {
  sessionStorage.setItem(PORTAL_KEY, portal)
  sessionStorage.setItem(PROVIDER_KEY, provider)
}

/** After redirect, stamp user metadata so DB triggers set portal_type / auth_provider. */
export async function applyOauthIntent(sb: SupabaseClient, user: User): Promise<void> {
  const portal = sessionStorage.getItem(PORTAL_KEY) as OauthPortal | null
  const provider = sessionStorage.getItem(PROVIDER_KEY) as OauthProvider | null
  if (!portal && !provider) return

  sessionStorage.removeItem(PORTAL_KEY)
  sessionStorage.removeItem(PROVIDER_KEY)

  const meta = user.user_metadata ?? {}
  const nextPortal = portal ?? (meta.portal_type as string | undefined) ?? 'enterprise'
  const nextProvider =
    provider ?? (meta.auth_provider as string | undefined) ?? (user.app_metadata?.provider as string | undefined)

  if (meta.portal_type === nextPortal && meta.auth_provider === nextProvider) return

  await sb.auth.updateUser({
    data: {
      portal_type: nextPortal,
      auth_provider: nextProvider,
    },
  })
}

export function getOAuthRedirectUrl(): string {
  return `${window.location.origin}/`
}
