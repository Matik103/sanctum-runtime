import { CreditCard, Sparkles } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Alert } from './ui/Alert'
import {
  formatApiError,
  isEntitlementFailure,
  looksLikeUpgradeMessage,
} from '../lib/sanitize-error'

type Props = {
  /** Pre-formatted message (optional if `error` is set). */
  message?: string
  /** Thrown API error — formatted and classified automatically. */
  error?: unknown
  fallback?: string
  onDismiss?: () => void
  style?: CSSProperties
}

/**
 * Entitlement / plan-gate → calm upgrade banner with View plans CTA.
 * Real failures → red error alert.
 */
export function PlanGateAlert({ message, error, fallback = 'Request failed', onDismiss, style }: Props) {
  const text = message ?? formatApiError(error, fallback)
  const gated = isEntitlementFailure(error) || looksLikeUpgradeMessage(text)

  if (!gated) {
    return (
      <Alert variant="error" onDismiss={onDismiss} style={style}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
            Action could not be completed
          </strong>
          <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{text}</span>
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
          <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{text}</span>
        </div>
        <a className="btn btn-primary btn-sm" href="?page=billing" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
          <CreditCard size={14} />
          View plans
        </a>
      </div>
    </Alert>
  )
}
