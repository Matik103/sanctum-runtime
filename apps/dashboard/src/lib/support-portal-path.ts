/** Dedicated operator portal — separate from the runtime console dashboard. */

export function isSupportPortalPath(): boolean {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  return path === '/support' || path.startsWith('/support/')
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

export function buildSupportPortalUrl(sessionPublicId?: string): string {
  const base = supportPortalBaseUrl()
  const q = sessionPublicId ? `?session=${encodeURIComponent(sessionPublicId)}` : ''
  return `${base}/support${q}`
}
