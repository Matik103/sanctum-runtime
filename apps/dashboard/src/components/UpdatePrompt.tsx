import { useEffect } from 'react'
import { registerSW } from 'virtual:pwa-register'

// When a new SW is available, reload immediately so the installed PWA always
// boots into the latest version. Combined with self.skipWaiting() in sw.ts,
// this means tapping the home-screen icon launches fresh code on every deploy.
export function UpdatePrompt() {
  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateSW(true)
      },
    })
  }, [])

  return null
}
