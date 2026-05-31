import { useState, useEffect, useCallback } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { urlBase64ToUint8Array } from '../lib/push'
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

  // iPadOS can present a desktop-style user agent. In that case Safari's
  // Version token is the most useful signal we have.
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
    if (!env.hasPushManager || !env.hasNotification) {
      if (env.iosVersion !== null && env.iosVersion < 16.4) return 'ios_upgrade_required'
      return 'ios_push_unavailable'
    }
  }
  if (!env.isSecureContext || !env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return 'unsupported'
  }
  return null
}

const SERVICE_WORKER_TIMEOUT_MS = 8_000

async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  const current = await navigator.serviceWorker.getRegistration()
  if (current?.active) return current

  let timeoutId: number | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('The app is still preparing notifications. Close and reopen Sanctum, then try again.')),
          SERVICE_WORKER_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
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
  if (!res.ok) throw new Error('Could not register this device for push notifications.')
}

function subscriptionUsesKey(sub: PushSubscription, publicKey: string): boolean {
  const subscriptionKey = sub.options.applicationServerKey
  if (!subscriptionKey) return false

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
): Promise<PushSubscription | null> {
  const sub = await reg.pushManager.getSubscription()
  if (!sub || subscriptionUsesKey(sub, publicKey)) return sub

  await removeSubscription(sub)
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
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
        const keyResponse = await fetch(`${apiBaseUrl}/v1/push/vapid-key`)
        const data = keyResponse.ok ? await keyResponse.json() as { publicKey?: string } : {}
        if (!active) return
        if (!data.publicKey) {
          setError('Push configuration is unavailable on the runtime API.')
          setState('unavailable')
          return
        }
        setVapidKey(data.publicKey)

        const reg = await readyServiceWorker()
        const sub = await currentSubscription(reg, data.publicKey)
        if (!active) return
        if (!sub) {
          setState('idle')
          return
        }
        setState('subscribed')
        try {
          await storeSubscription(sub)
          await refreshStatus()
        } catch {
          if (active) setError('This device is subscribed locally but could not be synchronized with Sanctum.')
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Push notifications are unavailable on this device.')
          setState('unavailable')
        }
      }
    })()

    return () => { active = false }
  }, [gating, refreshStatus])

  const subscribe = useCallback(async () => {
    const freshEnvironment = detectEnvironment()
    setEnvironment(freshEnvironment)
    const freshGating = gatingState(freshEnvironment)
    if (freshGating) {
      setState(freshGating)
      return
    }
    if (!vapidKey) {
      setError('Push configuration is not ready. Try again in a moment.')
      setState('unavailable')
      return
    }
    setError(null)
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    setState('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle')
        if (permission !== 'denied') setError('Notifications were not enabled. Tap Enable when you are ready.')
        return
      }

      const reg = await readyServiceWorker()
      let sub = await currentSubscription(reg, vapidKey)
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
        })
      }

      await storeSubscription(sub)
      await refreshStatus()
      setState('subscribed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable push notifications.')
      setState('idle')
    }
  }, [vapidKey, refreshStatus])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setError(null)
    try {
      const reg = await readyServiceWorker()
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
