import { useState, useEffect, useCallback } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import {
  ensurePushServiceWorker,
  existingPushServiceWorker,
  fetchVapidPublicKey,
  urlBase64ToUint8Array,
} from '../lib/push'
import { getAccessToken } from '../lib/supabase'

async function authHeaders(json = false): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/**
 * Push subscription state machine. iOS exposes Web Push only to installed
 * Home Screen apps on iOS 16.4 and newer.
 */
export type PushState =
  | 'checking'
  | 'idle'
  | 'subscribing'
  | 'subscribed'
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'ios_install_required'
  | 'ios_upgrade_required'
  | 'ios_push_unavailable'

type Environment = {
  hasServiceWorker: boolean
  hasNotification: boolean
  hasPushManager: boolean
  notificationPermission: NotificationPermission | 'unknown'
  isSecureContext: boolean
  isIos: boolean
  isStandalone: boolean
  iosVersion: number | null
}

function parseIosVersion(ua: string): number | null {
  const osMatch = ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS|iPad; CPU OS)\s+(\d+)[._](\d+)/i)
  if (osMatch) return Number(`${osMatch[1]}.${osMatch[2]}`)

  const safariMatch = ua.match(/Version\/(\d+)\.(\d+)/i)
  if (safariMatch) return Number(`${safariMatch[1]}.${safariMatch[2]}`)

  return null
}

function detectEnvironment(): Environment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      hasServiceWorker: false,
      hasNotification: false,
      hasPushManager: false,
      notificationPermission: 'unknown',
      isSecureContext: false,
      isIos: false,
      isStandalone: false,
      iosVersion: null,
    }
  }
  const ua = navigator.userAgent || ''
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  const hasPushManager =
    'PushManager' in window ||
    ('ServiceWorkerRegistration' in window && 'pushManager' in ServiceWorkerRegistration.prototype)
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotification: 'Notification' in window,
    hasPushManager,
    notificationPermission:
      'Notification' in window ? Notification.permission : 'unknown',
    isSecureContext: window.isSecureContext,
    isIos,
    isStandalone,
    iosVersion: isIos ? parseIosVersion(ua) : null,
  }
}

function gatingState(env: Environment): PushState | null {
  if (env.isIos) {
    if (!env.isStandalone) return 'ios_install_required'
    if (!env.hasNotification) {
      if (env.iosVersion !== null && env.iosVersion < 16.4) return 'ios_upgrade_required'
      return 'ios_push_unavailable'
    }
    // iOS Web Push is exposed from the installed app's service-worker
    // registration. Some builds do not advertise PushManager reliably during
    // passive feature detection, so let the user-gesture enrollment path make
    // the definitive check against registration.pushManager.
    if (env.iosVersion !== null && env.iosVersion < 16.4) return 'ios_upgrade_required'
    return null
  }
  if (!env.isSecureContext || !env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return 'unsupported'
  }
  return null
}

async function storeSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/push/subscribe`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({
      subscription: sub.toJSON(),
      userAgent: navigator.userAgent,
    }),
  })
  if (res.status === 401) {
    throw new Error('Sign in again, then enable push notifications.')
  }
  if (res.status === 503) {
    throw new Error('Push is not configured on the server (VAPID keys missing).')
  }
  if (!res.ok) throw new Error('Could not register this device for push notifications.')
}

function subscriptionUsesKey(sub: PushSubscription, publicKey: string): boolean {
  const subscriptionKey = (sub as PushSubscription & { options?: PushSubscriptionOptions }).options
    ?.applicationServerKey
  if (!subscriptionKey) return true

  const current = new Uint8Array(subscriptionKey)
  const expected = urlBase64ToUint8Array(publicKey)
  if (current.byteLength !== expected.byteLength) return false
  return current.every((byte, index) => byte === expected[index])
}

async function removeSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/push/unsubscribe`, {
    method: 'DELETE',
    headers: await authHeaders(true),
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
  if (!res.ok) throw new Error('Could not remove the previous push subscription.')
  const removed = await sub.unsubscribe()
  if (!removed) throw new Error('The browser could not replace its previous push subscription.')
}

async function currentSubscription(
  reg: ServiceWorkerRegistration,
  publicKey: string,
  opts: { resubscribe?: boolean } = {},
): Promise<PushSubscription | null> {
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  if (subscriptionUsesKey(sub, publicKey)) return sub

  await removeSubscription(sub)
  if (!opts.resubscribe) return null

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('checking')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [environment, setEnvironment] = useState<Environment>(detectEnvironment)

  const refreshEnvironment = useCallback(() => {
    setEnvironment(detectEnvironment())
  }, [])

  useEffect(() => {
    refreshEnvironment()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshEnvironment()
    }
    const mq = window.matchMedia?.('(display-mode: standalone)')
    const onDisplayModeChange = () => refreshEnvironment()

    window.addEventListener('focus', refreshEnvironment)
    window.addEventListener('pageshow', refreshEnvironment)
    document.addEventListener('visibilitychange', onVisibility)
    mq?.addEventListener?.('change', onDisplayModeChange)

    return () => {
      window.removeEventListener('focus', refreshEnvironment)
      window.removeEventListener('pageshow', refreshEnvironment)
      document.removeEventListener('visibilitychange', onVisibility)
      mq?.removeEventListener?.('change', onDisplayModeChange)
    }
  }, [refreshEnvironment])

  const gating = gatingState(environment)
  const supported = gating === null

  const refreshStatus = useCallback(async () => {
    const res = await fetch(`${apiBaseUrl}/v1/push/status`, {
      headers: await authHeaders(),
    })
    if (!res.ok) return
    const data = await res.json() as { deviceCount?: number }
    setDeviceCount(typeof data.deviceCount === 'number' ? data.deviceCount : null)
  }, [])

  const loadVapidKey = useCallback(async (): Promise<string> => {
    const key = await fetchVapidPublicKey(apiBaseUrl)
    setVapidKey(key)
    return key
  }, [])

  // Passive bootstrap: load VAPID key only. Do not register/wait for SW here —
  // that was marking the UI "unavailable" and disabling Enable before the user could act.
  useEffect(() => {
    setError(null)
    if (gating) {
      setState(gating)
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    let active = true
    void (async () => {
      try {
        setState('checking')
        const publicKey = await loadVapidKey()
        if (!active) return

        const reg = await existingPushServiceWorker()
        if (reg) {
          if (!('pushManager' in reg)) {
            setState('idle')
            return
          }
          const sub = await reg.pushManager.getSubscription()
          if (sub && subscriptionUsesKey(sub, publicKey)) {
            setState('subscribed')
            try {
              await storeSubscription(sub)
              await refreshStatus()
            } catch {
              if (active) {
                setError('This device is subscribed locally but could not be synchronized with Sanctum.')
              }
            }
            return
          }
        }

        setState('idle')
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Push notifications are unavailable on this device.')
        setState('unavailable')
      }
    })()

    return () => { active = false }
  }, [gating, loadVapidKey, refreshStatus])

  const subscribe = useCallback(async () => {
    const freshEnvironment = detectEnvironment()
    setEnvironment(freshEnvironment)
    const freshGating = gatingState(freshEnvironment)
    if (freshGating) {
      setState(freshGating)
      return
    }
    setError(null)
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    setState('subscribing')
    try {
      const key = vapidKey ?? (await loadVapidKey())

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle')
        if (permission !== 'denied') {
          setError('Notifications were not enabled. Tap Enable when you are ready.')
        }
        return
      }

      const reg = await ensurePushServiceWorker()
      if (!('pushManager' in reg)) {
        throw new Error(
          'This installed app is not exposing Web Push yet. Remove the Home Screen app, add Sanctum again from Safari, then reopen it from the new icon.',
        )
      }
      let sub = await currentSubscription(reg, key, { resubscribe: true })
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        })
      }

      await storeSubscription(sub)
      await refreshStatus()
      setState('subscribed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable push notifications.')
      setState(vapidKey ? 'idle' : 'unavailable')
    }
  }, [vapidKey, loadVapidKey, refreshStatus])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setError(null)
    try {
      const reg = (await existingPushServiceWorker()) ?? (await ensurePushServiceWorker())
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        setState('idle')
        return
      }
      await removeSubscription(sub)
      await refreshStatus()
      setState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disable push notifications.')
      setState('subscribed')
    }
  }, [supported, refreshStatus])

  const sendTest = useCallback(async () => {
    setTestBusy(true)
    setTestMessage(null)
    try {
      const res = await fetch(`${apiBaseUrl}/v1/push/test`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      if (res.status === 409) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setTestMessage(
          data.error === 'stale_push_subscription'
            ? 'This saved subscription expired. Disable and re-enable push on this device.'
            : 'No subscribed device was found. Enable push on this device first.',
        )
        return
      }
      if (!res.ok) {
        throw new Error('No device accepted the test notification. Open Settings on the enrolled device to refresh its secure subscription, then try again.')
      }
      const data = await res.json() as { delivered?: number }
      const delivered = data.delivered ?? 1
      setTestMessage(`Test notification delivered to ${delivered} device${delivered === 1 ? '' : 's'}.`)
      await refreshStatus()
    } catch (e) {
      setTestMessage(e instanceof Error ? e.message : 'Could not send a test push notification.')
    } finally {
      setTestBusy(false)
    }
  }, [refreshStatus])

  return {
    supported,
    state,
    error,
    environment,
    deviceCount,
    testBusy,
    testMessage,
    refreshEnvironment,
    subscribe,
    unsubscribe,
    sendTest,
  }
}
