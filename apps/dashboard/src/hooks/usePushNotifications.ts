import { useCallback, useEffect, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { pushSupported, urlBase64ToUint8Array } from '../lib/push'
import { getAccessToken } from '../lib/supabase'

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''

type PushStatus = {
  subscribed: boolean
  permission: NotificationPermission | 'unsupported'
  vapidConfigured: boolean
  deviceCount: number
  error: string | null
  busy: boolean
}

export function usePushNotifications(enabled: boolean): PushStatus & {
  subscribe: () => Promise<boolean>
  unsubscribe: () => Promise<boolean>
} {
  const [subscribed, setSubscribed] = useState(false)
  const [deviceCount, setDeviceCount] = useState(0)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    pushSupported() ? Notification.permission : 'unsupported',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!enabled || !pushSupported()) return
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`${apiBaseUrl}/v1/push/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const body = (await res.json()) as { deviceCount?: number; vapidConfigured?: boolean }
      setDeviceCount(body.deviceCount ?? 0)
    } catch {
      /* ignore */
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    setPermission(pushSupported() ? Notification.permission : 'unsupported')
    void refreshStatus()
  }, [enabled, refreshStatus])

  const subscribe = useCallback(async () => {
    if (!pushSupported()) {
      setError('Push notifications are not supported in this browser.')
      return false
    }
    if (!vapidPublicKey) {
      setError('Push is not configured on this deployment (missing VAPID public key).')
      return false
    }

    setBusy(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('Notification permission denied.')
        return false
      }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      const token = await getAccessToken()
      if (!token) throw new Error('Sign in required')

      const res = await fetch(`${apiBaseUrl}/v1/push/subscribe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
        throw new Error(body.detail ?? body.error ?? `Subscribe failed (${res.status})`)
      }

      setSubscribed(true)
      await refreshStatus()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable push')
      return false
    } finally {
      setBusy(false)
    }
  }, [refreshStatus])

  const unsubscribe = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const token = await getAccessToken()
        if (token) {
          await fetch(`${apiBaseUrl}/v1/push/unsubscribe`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
        }
        await sub.unsubscribe()
      }
      setSubscribed(false)
      await refreshStatus()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable push')
      return false
    } finally {
      setBusy(false)
    }
  }, [refreshStatus])

  return {
    subscribed,
    permission,
    vapidConfigured: Boolean(vapidPublicKey),
    deviceCount,
    error,
    busy,
    subscribe,
    unsubscribe,
  }
}
