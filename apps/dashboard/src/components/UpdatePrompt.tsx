import { useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'

// When a new SW is available, reload immediately so the installed PWA always
// boots into the latest version. Combined with self.skipWaiting() in sw.ts,
// this means tapping the home-screen icon launches fresh code on every deploy.
export function UpdatePrompt() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true)
      },
    })

    const checkForUpdate = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      void navigator.serviceWorker.getRegistration()
        .then((registration) => registration?.update())
        .catch(() => {})
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    const intervalId = window.setInterval(checkForUpdate, 15 * 60 * 1000)
    window.addEventListener('online', checkForUpdate)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', checkForUpdate)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return null
}
