import { useState, useEffect, useCallback } from 'react'
import { getAccessToken } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_SANCTUM_API_URL ?? ''

async function authJsonHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

/**
 * Push subscription state machine.
 *
 *   idle              — supported but not yet subscribed
 *   subscribing       — permission prompt in flight
 *   subscribed        — active push subscription on this device
 *   denied            — user blocked notifications in OS / browser settings
 *   unavailable       — backend hasn't published a VAPID key (operator config)
 *   ios_install_required  — iOS Safari tab; Apple only exposes Web Push to
 *                           installed PWAs. User must Add to Home Screen.
 *   ios_upgrade_required  — iOS PWA running on iOS < 16.4 (no Web Push)
 *   unsupported       — non-iOS browser without serviceWorker / PushManager /
 *                       Notification API (older Firefox, niche browsers).
 */
export type PushState =
  | 'idle'
  | 'subscribing'
  | 'subscribed'
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'ios_install_required'
  | 'ios_upgrade_required'

type Environment = {
  hasServiceWorker: boolean
  hasNotification: boolean
  hasPushManager: boolean
  isIos: boolean
  isStandalone: boolean
}

function detectEnvironment(): Environment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      hasServiceWorker: false,
      hasNotification: false,
      hasPushManager: false,
      isIos: false,
      isStandalone: false,
    }
  }
  const ua = navigator.userAgent || ''
  // iPadOS reports as Mac with touch — include it so iPad PWAs detect correctly.
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
    isIos,
    isStandalone,
  }
}

/**
 * Returns the appropriate "not yet able to subscribe" state for the
 * current environment, or null if the environment fully supports push.
 *
 * Order of precedence matches what gives the user the clearest action:
 *  1. iOS Safari tab    → tell them to install
 *  2. iOS PWA on old iOS → tell them to update
 *  3. Other browser without push APIs → generic unsupported
 */
function gatingState(env: Environment): PushState | null {
  if (env.isIos) {
    if (!env.isStandalone) return 'ios_install_required'
    if (!env.hasPushManager || !env.hasNotification) return 'ios_upgrade_required'
  }
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    return 'unsupported'
  }
  return null
}

async function storeSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/push/subscribe`, {
    method: 'POST',
    headers: await authJsonHeaders(),
    body: JSON.stringify({
      subscription: sub.toJSON(),
      userAgent: navigator.userAgent,
    }),
  })
  if (!res.ok) throw new Error('Could not register this device for push notifications.')
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('idle')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [env] = useState<Environment>(detectEnvironment)

  const gating = gatingState(env)
  const supported = gating === null

  useEffect(() => {
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
        const keyResponse = await fetch(`${API_BASE}/v1/push/vapid-key`)
        const data = keyResponse.ok ? await keyResponse.json() as { publicKey?: string } : {}
        if (!active) return
        if (data.publicKey) setVapidKey(data.publicKey)
        else setState('unavailable')

        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!active || !sub) return
        setState('subscribed')
        try {
          await storeSubscription(sub)
        } catch {
          if (active) setError('This device is subscribed locally but could not be synchronized with Sanctum.')
        }
      } catch {
        if (active) setState('unavailable')
      }
    })()

    return () => { active = false }
  }, [gating])

  const subscribe = useCallback(async () => {
    if (!supported || !vapidKey) return
    setError(null)
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    setState('subscribing')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        return
      }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
        })
      }

      await storeSubscription(sub)
      setState('subscribed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable push notifications.')
      setState('idle')
    }
  }, [supported, vapidKey])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        setState('idle')
        return
      }
      const res = await fetch(`${API_BASE}/v1/push/unsubscribe`, {
        method: 'DELETE',
        headers: await authJsonHeaders(),
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      if (!res.ok) throw new Error('Could not disable push notifications. Try again.')
      const removed = await sub.unsubscribe()
      if (!removed) throw new Error('The browser could not remove this push subscription.')
      setState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disable push notifications.')
      setState('subscribed')
    }
  }, [supported])

  return { supported, state, error, environment: env, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
