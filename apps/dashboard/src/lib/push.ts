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
const SW_READY_TIMEOUT_MS = 20_000

/**
 * Ensure a push-capable service worker is registered and active.
 * Call from user gestures (Enable push) — not on passive page load.
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

  if (registration.active) return registration

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () =>
        reject(
          new Error(
            'Notifications are still loading. Reload Sanctum, wait a few seconds, then tap Enable again.',
          ),
        ),
      SW_READY_TIMEOUT_MS,
    )

    const finish = () => {
      window.clearTimeout(timeoutId)
      resolve()
    }

    const worker = registration!.installing ?? registration!.waiting
    if (worker) {
      if (worker.state === 'activated') {
        finish()
        return
      }
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') finish()
      })
    }

    navigator.serviceWorker.ready.then(finish).catch((err) => {
      window.clearTimeout(timeoutId)
      reject(err)
    })
  })

  const ready = await navigator.serviceWorker.getRegistration('/')
  if (!ready?.active) {
    throw new Error('Service worker is not active yet. Reload the app and try again.')
  }
  return ready
}

/** Returns an active registration if one already exists — never registers. */
export async function existingPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration?.active ? registration : null
}
