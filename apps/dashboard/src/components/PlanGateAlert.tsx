import { CreditCard, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Alert } from './ui/Alert'
import { looksLikeUpgradeMessage } from '../lib/sanitize-error'

type Props = {
  message: string
  onDismiss?: () => void
  style?: CSSProperties
}

/**
 * Renders API errors. Entitlement / plan-gate messages get a calm,
 * upgrade-styled banner with a View plans CTA; real failures stay red.
 */
export function PlanGateAlert({ message, onDismiss, style }: Props) {
  const gated = looksLikeUpgradeMessage(message)

  if (!gated) {
    return (
      <Alert variant="error" onDismiss={onDismiss} style={style}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
            Action could not be completed
          </strong>
          <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{message}</span>
        </div>
      </Alert>
    )
  }

  return (
    <Alert variant="info" onDismiss={onDismiss} style={style}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
            <Sparkles size={14} aria-hidden />
            Upgrade to unlock this
          </strong>
          <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{message}</span>
        </div>
        <a className="btn btn-primary btn-sm" href="?page=billing" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
          <CreditCard size={14} />
          View plans
        </a>
      </div>
    </Alert>
  )
}
