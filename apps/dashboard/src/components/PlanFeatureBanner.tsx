import type { ReactNode } from 'react'
import { CreditCard } from 'lucide-react'
import type { PageId } from '../layout/Sidebar'

type Props = {
  feature: string
  message: string
  allowed: boolean
  onPage?: (p: PageId) => void
  children?: ReactNode
}

/** Proactive plan gate — shown before the user hits an API wall. */
export function PlanFeatureBanner({ feature, message, allowed, onPage, children }: Props) {
  if (allowed) return children ? <>{children}</> : null
  return (
    <div className="alert alert--info" style={{ marginBottom: '1rem' }} role="status">
      <div className="alert__body" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>{feature}</strong>
          <span style={{ display: 'block', fontSize: '0.84rem', marginTop: '0.2rem', opacity: 0.85 }}>{message}</span>
        </div>
        {onPage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPage('billing')}>
            <CreditCard size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Upgrade on Billing
          </button>
        )}
      </div>
    </div>
  )
}
