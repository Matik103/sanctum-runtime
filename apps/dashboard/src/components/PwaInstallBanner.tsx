import { useState } from 'react'
import { Download, Share, Plus, X } from 'lucide-react'
import { usePwa } from '../hooks/usePwa'

export function PwaInstallBanner() {
  const { canInstall, hasNativePrompt, isIos, promptInstall, dismissInstallBanner, isStandalone } = usePwa()
  const [showIosSteps, setShowIosSteps] = useState(false)

  if (isStandalone || !canInstall) return null

  return (
    <div className="pwa-install-banner" role="region" aria-label="Install Sanctum">
      <div className="pwa-install-banner__icon" aria-hidden>
        <Download size={20} />
      </div>
      <div className="pwa-install-banner__copy">
        <strong>Install Sanctum Companion</strong>
        <p>Add to your home screen for runtime verifications, alerts, and one-tap approvals.</p>
        {isIos && showIosSteps && (
          <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem', lineHeight: 1.5 }}>
            <li>Tap the <Share size={12} style={{ verticalAlign: 'middle' }} aria-label="Share" /> Share button in Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong> <Plus size={12} style={{ verticalAlign: 'middle' }} aria-hidden />.</li>
            <li>Tap <strong>Add</strong>. Open Sanctum from your home screen to enable push alerts.</li>
          </ol>
        )}
      </div>
      <div className="pwa-install-banner__actions">
        {hasNativePrompt ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void promptInstall()}>
            Install
          </button>
        ) : isIos ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowIosSteps((v) => !v)}
            aria-expanded={showIosSteps}
          >
            {showIosSteps ? 'Hide steps' : 'How to install'}
          </button>
        ) : null}
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
