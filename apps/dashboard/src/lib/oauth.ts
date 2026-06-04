import type { SupabaseClient, User } from '@supabase/supabase-js'
import { TERMS_VERSION } from './signup-fields'

const PORTAL_KEY = 'sanctum_oauth_portal'
const PROVIDER_KEY = 'sanctum_oauth_provider'
const TERMS_KEY = 'sanctum_oauth_terms_at'

export type OauthPortal = 'operator' | 'enterprise'
export type OauthProvider = 'google' | 'github'

/** Stamped on OAuth redirect so DB triggers see portal before profile bootstrap. */
export function oauthSignupMetadata(
  portal: OauthPortal,
  provider: OauthProvider,
  termsAcceptedAt?: string,
): Record<string, string> {
  const meta: Record<string, string> = {
    signup_type: 'individual',
    portal_type: portal,
    auth_provider: provider,
    signup_source: 'dashboard',
  }
  if (termsAcceptedAt) {
    meta.terms_accepted_at = termsAcceptedAt
    meta.terms_version = TERMS_VERSION
  }
  return meta
}

/** Remember intent across the OAuth redirect (sessionStorage survives same-tab return). */
export function markOauthIntent(
  portal: OauthPortal,
  provider: OauthProvider,
  termsAcceptedAt?: string,
): void {
  sessionStorage.setItem(PORTAL_KEY, portal)
  sessionStorage.setItem(PROVIDER_KEY, provider)
  if (termsAcceptedAt) sessionStorage.setItem(TERMS_KEY, termsAcceptedAt)
  else sessionStorage.removeItem(TERMS_KEY)
}

/** After redirect, stamp user metadata so DB triggers set portal_type / auth_provider. */
export async function applyOauthIntent(sb: SupabaseClient, user: User): Promise<void> {
  const portal = sessionStorage.getItem(PORTAL_KEY) as OauthPortal | null
  const provider = sessionStorage.getItem(PROVIDER_KEY) as OauthProvider | null
  const termsAt = sessionStorage.getItem(TERMS_KEY)
  if (!portal && !provider) return

  sessionStorage.removeItem(PORTAL_KEY)
  sessionStorage.removeItem(PROVIDER_KEY)
  sessionStorage.removeItem(TERMS_KEY)

  const meta = user.user_metadata ?? {}
  const nextPortal =
    portal ??
    (meta.portal_type as OauthPortal | undefined) ??
    'operator'
  const nextProvider =
    provider ?? (meta.auth_provider as string | undefined) ?? (user.app_metadata?.provider as string | undefined)

  if (meta.portal_type === nextPortal && meta.auth_provider === nextProvider) return

  const patch: Record<string, string> = {
    portal_type: nextPortal,
    auth_provider: nextProvider,
  }
  if (termsAt) {
    patch.terms_accepted_at = termsAt
    patch.terms_version = TERMS_VERSION
  }

  await sb.auth.updateUser({ data: patch })
}

export function getOAuthRedirectUrl(): string {
  return `${window.location.origin}/`
}
