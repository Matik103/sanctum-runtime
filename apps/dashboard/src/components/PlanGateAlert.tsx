import { CreditCard } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Alert } from './ui/Alert'
import { looksLikeUpgradeMessage } from '../lib/sanitize-error'

type Props = {
  message: string
  onDismiss?: () => void
  style?: CSSProperties
}

export function PlanGateAlert({ message, onDismiss, style }: Props) {
  const gated = looksLikeUpgradeMessage(message)
  return (
    <Alert variant="error" onDismiss={onDismiss} style={style}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
          <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
            {gated ? 'Upgrade required' : 'Action could not be completed'}
          </strong>
          <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{message}</span>
        </div>
        {gated && (
          <a className="btn btn-primary btn-sm" href="?page=billing" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
            <CreditCard size={14} />
            View plans
          </a>
        )}
      </div>
    </Alert>
  )
}
