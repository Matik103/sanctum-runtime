/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Bump this whenever the caching strategy or app shell changes.
// Old caches whose name doesn't match are deleted on activate.
const SW_VERSION = '4'

const CACHE_NAMES = {
  api:        `sanctum-api-v${SW_VERSION}`,
  fontsCss:   `google-fonts-stylesheets-v${SW_VERSION}`,
  fontsFiles: `google-fonts-webfonts-v${SW_VERSION}`,
  images:     `images-v${SW_VERSION}`,
}

clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Delete stale versioned caches from previous SW installs
self.addEventListener('activate', (event) => {
  const keep = new Set(Object.values(CACHE_NAMES))
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('sanctum-') || k.startsWith('google-fonts-') || k.startsWith('images-'))
          .filter((k) => !keep.has(k))
          .map((k) => caches.delete(k)),
      ),
    ),
  )
})

// App-shell navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), {
  denylist: [/^\/api\//, /^\/v1\//],
}))

// Sanctum API — NetworkFirst so fresh data loads when online, falls back to cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.api,
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 5 * 60 }),
    ],
  }),
)

// Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: CACHE_NAMES.fontsCss,
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: CACHE_NAMES.fontsFiles,
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

// Images — StaleWhileRevalidate so they load fast and refresh in background
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.images,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
)

// ── Firebase Cloud Messaging (background push) ───────────────────────────────

const firebaseApp = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
})

const messaging = getMessaging(firebaseApp)

onBackgroundMessage(messaging, (payload) => {
  const title = payload.notification?.title ?? 'Sanctum Alert'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  self.registration.showNotification(title, {
    body:    payload.notification?.body ?? '',
    icon:    '/icon-192.png',
    badge:   '/favicon.png',
    tag:     payload.data?.type ? `${payload.data['orgId']}:${payload.data['type']}` : 'sanctum-alert',
    data:    payload.data ?? {},
  } as any)
})

// ── Raw VAPID web-push (server uses webpush.sendNotification, not FCM) ─────
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: {
    title?: string
    body?: string
    tag?: string
    icon?: string
    badge?: string
    url?: string
    data?: Record<string, unknown>
    requireInteraction?: boolean
  } = {}
  try { payload = event.data.json() } catch { payload = { body: event.data.text() } }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Sanctum Alert', {
      body: payload.body ?? '',
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/favicon.png',
      tag: payload.tag ?? 'sanctum-alert',
      requireInteraction: Boolean(payload.requireInteraction),
      data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
    } as NotificationOptions),
  )
})

// Open/focus app on notification click — deep-link to verification page when available
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: string; entryId?: string; type?: string }
  // Prefer explicit URL; else build a deep-link for verification notifications
  const target = data.url
    ?? (data.type === 'agent.require_verification' && data.entryId
      ? `/?page=activity&verify=${encodeURIComponent(data.entryId)}`
      : '/')

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          const win = client as WindowClient
          if ('navigate' in win) void win.navigate(target).catch(() => {})
          return win.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
