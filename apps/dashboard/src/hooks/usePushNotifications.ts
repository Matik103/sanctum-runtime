import { useCallback, useEffect, useRef, useState } from 'react'
import { requestFcmToken, getFirebaseMessaging, onMessage } from '../lib/firebase'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'

const TOKEN_KEY = 'sanctum-fcm-token'

async function registerToken(orgId: string, token: string): Promise<void> {
  const jwt = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`
  await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/push-subscriptions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token, deviceName: navigator.userAgent.slice(0, 100) }),
  })
}

async function unregisterToken(orgId: string, token: string): Promise<void> {
  const jwt = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`
  await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/push-subscriptions`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ token }),
  })
}

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function usePushNotifications(orgId: string | null | undefined) {
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    const current = Notification.permission as PushPermissionState
    setPermission(current)
    if (current === 'granted') {
      tokenRef.current = localStorage.getItem(TOKEN_KEY)
    }
  }, [])

  // Listen for foreground messages and show a browser notification
  useEffect(() => {
    if (permission !== 'granted') return
    const m = getFirebaseMessaging()
    if (!m) return
    const unsub = onMessage(m, (payload) => {
      const title = payload.notification?.title ?? 'Sanctum Alert'
      const body  = payload.notification?.body  ?? ''
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon-512.png', badge: '/favicon.png' })
      }
    })
    return unsub
  }, [permission])

  const enable = useCallback(async () => {
    if (!orgId) return
    if (!('Notification' in window)) return

    const perm = await Notification.requestPermission()
    setPermission(perm as PushPermissionState)
    if (perm !== 'granted') return

    const token = await requestFcmToken()
    if (!token) return

    tokenRef.current = token
    localStorage.setItem(TOKEN_KEY, token)
    await registerToken(orgId, token).catch((e) => console.warn('[push] register failed:', e))
  }, [orgId])

  const disable = useCallback(async () => {
    if (!orgId) return
    const token = tokenRef.current ?? localStorage.getItem(TOKEN_KEY)
    if (!token) return
    await unregisterToken(orgId, token).catch((e) => console.warn('[push] unregister failed:', e))
    localStorage.removeItem(TOKEN_KEY)
    tokenRef.current = null
  }, [orgId])

  return { permission, enable, disable }
}
