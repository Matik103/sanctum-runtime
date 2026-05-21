/* Service worker push handlers (imported by Workbox via vite-plugin-pwa). */

self.addEventListener('push', (event) => {
  let payload = { title: 'Sanctum Alert', body: 'Verification required', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    if (event.data) payload.body = event.data.text()
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/favicon-512.png',
    badge: '/favicon.png',
    tag: payload.tag || 'sanctum-alert',
    data: { url: payload.url || '/' },
    requireInteraction: Boolean(payload.requireInteraction),
    actions: payload.actions,
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Sanctum Alert', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
