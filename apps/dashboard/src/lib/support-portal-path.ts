/** Dedicated operator portal — separate from the runtime console dashboard. */

export function isSupportPortalPath(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === '/support' || path.startsWith('/support/')) return true

  // Boot from / when static host does not rewrite /support → index.html (Render 404 today).
  const params = new URLSearchParams(window.location.search)
  return params.get('page') === 'support-inbox'
}

export function supportPortalSessionFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const session = new URLSearchParams(window.location.search).get('session')?.trim()
  return session && session.length >= 8 ? session : null
}

export function supportPortalBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_CONSOLE_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://console.sanctumruntime.com'
}

/** URL that works on static hosts where only / rewrites to index.html. */
export function buildSupportPortalUrl(sessionPublicId?: string): string {
  const base = supportPortalBaseUrl()
  const params = new URLSearchParams({ page: 'support-inbox' })
  if (sessionPublicId) params.set('session', sessionPublicId)
  return `${base}/?${params.toString()}`
}
