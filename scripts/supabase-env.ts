/**
 * Normalize Supabase URL and map VITE_* → server env (API reads SUPABASE_*).
 */

export function normalizeSupabaseUrl(raw: string): string {
  let u = raw.trim().replace(/\/$/, '')
  u = u.replace(/\/rest\/v1\/?$/i, '')
  return u
}

/** After dotenv load: dashboard VITE_* keys also satisfy API SUPABASE_* vars. */
export function applyViteSupabaseAliases(): void {
  const viteUrl = process.env.VITE_SUPABASE_URL?.trim()
  if (viteUrl) {
    const normalized = normalizeSupabaseUrl(viteUrl)
    process.env.VITE_SUPABASE_URL = normalized
    if (!process.env.SUPABASE_URL?.trim()) {
      process.env.SUPABASE_URL = normalized
    }
  }
  if (process.env.SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL)
  }

  const viteAnon = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (viteAnon && !process.env.SUPABASE_ANON_KEY?.trim()) {
    process.env.SUPABASE_ANON_KEY = viteAnon
  }

  const viteService = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (viteService && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = viteService
  }
}
