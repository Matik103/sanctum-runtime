import { Shield } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { usePwa } from '../hooks/usePwa'

type Props = {
  status: RuntimeStatus | null
  pendingReviewCount: number
  onOpenReview?: () => void
}

export function MobileCompanionHeader({ status, pendingReviewCount, onOpenReview }: Props) {
  const { isStandalone } = usePwa()
  const online = status?.runtimeOnline !== false

  return (
    <header className="companion-header">
      <div className="companion-header__brand">
        <Shield size={18} aria-hidden />
        <div>
          <span className="companion-header__title">Sanctum Companion</span>
          {isStandalone && <span className="companion-header__badge">Installed</span>}
        </div>
      </div>
      <div className="companion-header__status">
        <span className={`status-dot ${online ? 'ok' : 'warn'}`} aria-hidden />
        <span>{online ? 'Runtime active' : 'Runtime offline'}</span>
      </div>
      {pendingReviewCount > 0 && onOpenReview && (
        <button type="button" className="companion-header__verify btn btn-primary btn-sm" onClick={onOpenReview}>
          {pendingReviewCount} verification{pendingReviewCount === 1 ? '' : 's'}
        </button>
      )}
    </header>
  )
}
