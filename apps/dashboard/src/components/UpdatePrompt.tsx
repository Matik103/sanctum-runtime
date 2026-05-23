import { useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function UpdatePrompt() {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [applying, setApplying] = useState(false)
  const activateUpdate = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedsRefresh(true)
      },
    })
    activateUpdate.current = updateSW

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
      activateUpdate.current = null
    }
  }, [])

  const refreshNow = async () => {
    setApplying(true)
    try {
      await activateUpdate.current?.(true)
    } finally {
      setApplying(false)
    }
  }

  if (!needsRefresh) return null

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <p>A console update is ready.</p>
      <button type="button" className="btn btn-primary btn-sm" disabled={applying} onClick={() => void refreshNow()}>
        {applying ? 'Refreshing...' : 'Refresh now'}
      </button>
    </div>
  )
}
