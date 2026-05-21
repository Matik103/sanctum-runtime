import { Download, X } from 'lucide-react'
import { usePwa } from '../hooks/usePwa'

export function PwaInstallBanner() {
  const { canInstall, promptInstall, dismissInstallBanner, isStandalone } = usePwa()

  if (isStandalone || !canInstall) return null

  return (
    <div className="pwa-install-banner" role="region" aria-label="Install Sanctum">
      <div className="pwa-install-banner__icon" aria-hidden>
        <Download size={20} />
      </div>
      <div className="pwa-install-banner__copy">
        <strong>Install Sanctum Companion</strong>
        <p>Add to your home screen for runtime verifications, alerts, and one-tap approvals.</p>
      </div>
      <div className="pwa-install-banner__actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void promptInstall()}>
          Install
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Dismiss install prompt"
          onClick={dismissInstallBanner}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
