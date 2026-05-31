/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { addRoute, precache, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { sameOriginNotificationTarget } from './lib/notification-target'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Bump this whenever the caching strategy or app shell changes.
// Old caches whose name doesn't match are deleted on activate.
const SW_VERSION = '9'

const CACHE_NAMES = {
  shell:      `sanctum-shell-v${SW_VERSION}`,
  fontsCss:   `google-fonts-stylesheets-v${SW_VERSION}`,
  fontsFiles: `google-fonts-webfonts-v${SW_VERSION}`,
  images:     `images-v${SW_VERSION}`,
}

clientsClaim()
precache(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Activation is explicit so a deploy cannot reload an operator midway
// through policy edits or an approval review.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

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

// Prefer fresh HTML while online so a deployed console release is visible
// immediately; fall back to the precached shell when connectivity is absent.
const navigationStrategy = new NetworkFirst({
  cacheName: CACHE_NAMES.shell,
  networkTimeoutSeconds: 4,
})
const offlineShell = createHandlerBoundToURL('index.html')

registerRoute(new NavigationRoute(async (options) => {
  try {
    return await navigationStrategy.handle(options)
  } catch {
    return offlineShell(options)
  }
}, {
  denylist: [/^\/api\//, /^\/v1\//],
}))

// Register precached asset handling after the navigation strategy so cached
// index.html cannot intercept online app-shell navigations.
addRoute()

// Never cache authenticated control-plane API data. Offline action submissions
// are queued in app storage; historical and credential-bearing reads stay live.

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

// ── VAPID web-push (server uses webpush.sendNotification) ──────────────────
type PushPayload = {
  title?: string
  message?: string
  body?: string
  tag?: string
  icon?: string
  badge?: string
  url?: string
  data?: Record<string, unknown>
  requireInteraction?: boolean
}

function parsePushPayload(event: PushEvent): PushPayload {
  if (!event.data) return {}
  try {
    return event.data.json() as PushPayload
  } catch {
    try {
      return JSON.parse(event.data.text()) as PushPayload
    } catch {
      return { body: event.data.text() }
    }
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event)
  const title = payload.title ?? payload.message ?? 'Sanctum Alert'
  const body = payload.body ?? ''

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/favicon.png',
      tag: payload.tag ?? 'sanctum-alert',
      requireInteraction: Boolean(payload.requireInteraction),
      data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: string; entryId?: string; type?: string }
  // Prefer explicit URL; else build a deep-link for verification notifications
  const target = sameOriginNotificationTarget(data.url, self.location.origin)
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
