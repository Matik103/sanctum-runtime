/** URL-safe base64 VAPID public key → Uint8Array for PushManager.subscribe */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Build-time fallback — must match API `VAPID_PUBLIC_KEY` (daily-quest uses this pattern). */
export function bundledVapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
  return key || null
}

/** Prefer live API key; fall back to bundled public key if the fetch fails. */
export async function fetchVapidPublicKey(apiBase: string): Promise<string> {
  try {
    // Timeout matters: a sleeping/cold-starting API would otherwise hang this
    // fetch forever and leave the Settings push section stuck on "Checking".
    const res = await fetch(`${apiBase}/v1/push/vapid-key`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (res.ok) {
      const data = (await res.json()) as { publicKey?: string | null; vapidConfigured?: boolean }
      if (data.publicKey) return data.publicKey
      if (data.vapidConfigured === false) {
        throw new Error('Push is not configured on the API (VAPID keys missing).')
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('VAPID keys missing')) throw e
    // Network/CORS blip or timeout — try bundled key below.
  }

  const bundled = bundledVapidPublicKey()
  if (bundled) return bundled

  throw new Error(
    'Push configuration is unavailable. Check your network or set VITE_VAPID_PUBLIC_KEY to match the API.',
  )
}

const SW_SCRIPT_URL = '/sw.js'
const SW_READY_TIMEOUT_MS = 15_000

/**
 * Register /sw.js if needed, then wait for `navigator.serviceWorker.ready`.
 * Same shape as daily-quest — call from user gestures (Enable push), not passive load.
 */
export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.')
  }

  let registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) {
    registration = await navigator.serviceWorker.register(SW_SCRIPT_URL, {
      scope: '/',
      updateViaCache: 'none',
    })
  } else {
    void registration.update().catch(() => {})
  }

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) => {
      window.setTimeout(
        () =>
          reject(
            new Error('Notifications are still loading. Reload Sanctum, then tap Enable again.'),
          ),
        SW_READY_TIMEOUT_MS,
      )
    }),
  ])
}

/** Active registration only — never registers (safe for passive Settings load). */
export async function existingPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration?.active ? registration : null
}
