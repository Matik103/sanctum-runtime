import { useState, useEffect } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallBanner() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(() =>
    localStorage.getItem('pwa-install-dismissed') === '1',
  )
  const [notifDismissed, setNotifDismissed] = useState(() =>
    localStorage.getItem('pwa-notif-dismissed') === '1',
  )

  const { supported: pushSupported, state: pushState, subscribe } = usePushNotifications()

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const dismissInstall = () => {
    localStorage.setItem('pwa-install-dismissed', '1')
    setInstallDismissed(true)
  }

  const dismissNotif = () => {
    localStorage.setItem('pwa-notif-dismissed', '1')
    setNotifDismissed(true)
  }

  const showInstall = installPrompt && !installDismissed
  const showNotif =
    pushSupported &&
    pushState === 'idle' &&
    !notifDismissed &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'default'

  if (!showInstall && !showNotif) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      {showInstall && (
        <div className="alert alert--info" role="banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ flex: 1 }}>
            <strong>Install Sanctum</strong> — add to your home screen for instant access and push notifications.
          </span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={handleInstall}
          >
            Install
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={dismissInstall}
            aria-label="Dismiss install prompt"
          >
            ✕
          </button>
        </div>
      )}

      {showNotif && !showInstall && (
        <div className="alert alert--info" role="banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ flex: 1 }}>
            <strong>Enable push notifications</strong> — get alerted when agents need your approval.
          </span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => { void subscribe(); dismissNotif() }}
          >
            Enable
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={dismissNotif}
            aria-label="Dismiss notification prompt"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
