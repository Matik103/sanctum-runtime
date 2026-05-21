import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export async function getAccessToken(): Promise<string | undefined> {
  const sb = getSupabase()
  if (!sb) return undefined
  const { data } = await sb.auth.getSession()
  const session = data.session
  if (!session) return undefined

  // Proactively refresh if the token expires within the next 60 seconds.
  // autoRefreshToken handles background refresh, but network latency can still
  // cause 401s on API calls that land just as the old token expires.
  const expiresAt = session.expires_at  // Unix timestamp in seconds (from Supabase)
  if (expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const { data: refreshed } = await sb.auth.refreshSession()
    return refreshed.session?.access_token ?? session.access_token
  }

  return session.access_token
}

export type { Session }
