import { useCallback, useEffect, useState } from 'react'

const DISMISS_KEY = 'sanctum_pwa_install_dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function detectIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
  // iOS routes every browser through WebKit, so "Safari" appears in CriOS/FxiOS UA strings too —
  // exclude only when the third-party shell prefix is present, since Add-to-Home-Screen
  // works the same on every iOS browser ≥ iOS 16.4.
  return isIos
}

export function usePwa() {
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos] = useState(detectIosSafari)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)')
    const onChange = () => setIsStandalone(isStandaloneDisplay())
    mq.addEventListener('change', onChange)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  // Android/desktop: native install prompt is ready. iOS: show Add-to-Home-Screen instructions.
  const canInstall = (Boolean(installEvent) || isIos) && !isStandalone && !dismissed

  const promptInstall = useCallback(async () => {
    if (!installEvent) return false
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') setInstallEvent(null)
    return outcome === 'accepted'
  }, [installEvent])

  const dismissInstallBanner = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  return {
    isStandalone,
    canInstall,
    isIos,
    hasNativePrompt: Boolean(installEvent),
    promptInstall,
    dismissInstallBanner,
  }
}
