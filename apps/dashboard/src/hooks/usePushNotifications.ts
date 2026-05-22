import { useState, useEffect, useCallback } from 'react'
import { getAccessToken } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_SANCTUM_API_URL ?? ''

async function authJsonHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

type PushState = 'idle' | 'subscribing' | 'subscribed' | 'unsupported' | 'denied'

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('idle')
  const [vapidKey, setVapidKey] = useState<string | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  useEffect(() => {
    if (!supported) {
      setState('unsupported')
      return
    }

    // Fetch VAPID public key once
    fetch(`${API_BASE}/v1/push/vapid-key`)
      .then((r) => r.json())
      .then((data: { publicKey?: string }) => {
        if (data.publicKey) setVapidKey(data.publicKey)
      })
      .catch(() => {})

    // Reflect existing permission/subscription state
    if (Notification.permission === 'denied') {
      setState('denied')
    } else {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) setState('subscribed')
        })
        .catch(() => {})
    }
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported || !vapidKey) return
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

      const res = await fetch(`${API_BASE}/v1/push/subscribe`, {
        method: 'POST',
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) {
        // Server refused (likely no org/user) — keep SW subscription so we can retry later
        setState('idle')
        return
      }

      setState('subscribed')
    } catch {
      setState('idle')
    }
  }, [supported, vapidKey])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        setState('idle')
        return
      }
      await fetch(`${API_BASE}/v1/push/unsubscribe`, {
        method: 'DELETE',
        headers: await authJsonHeaders(),
        body: JSON.stringify({ endpoint: sub.endpoint }),
      })
      await sub.unsubscribe()
      setState('idle')
    } catch {
      setState('idle')
    }
  }, [supported])

  return { supported, state, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}
