/** URL-safe base64 VAPID public key → Uint8Array for PushManager.subscribe */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
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

const SW_SCRIPT_URL = '/sw.js'

/**
 * Ensure a push-capable service worker is registered and active.
 * Mirrors the daily-quest pattern: getRegistration() first, else register('/sw.js').
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
  }

  if (registration.active) return registration

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('The app is still preparing notifications. Close and reopen Sanctum, then try again.')),
      8_000,
    )
    const worker = registration!.installing ?? registration!.waiting
    if (worker) {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          window.clearTimeout(timeoutId)
          resolve()
        }
      })
    }
    navigator.serviceWorker.ready
      .then(() => {
        window.clearTimeout(timeoutId)
        resolve()
      })
      .catch((err) => {
        window.clearTimeout(timeoutId)
        reject(err)
      })
  })

  return navigator.serviceWorker.ready
}
