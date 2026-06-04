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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span>{message}</span>
        {gated && (
          <a className="btn btn-primary btn-sm" href="?page=billing" style={{ textDecoration: 'none' }}>
            <CreditCard size={14} />
            Open Billing
          </a>
        )}
      </div>
    </Alert>
  )
}
