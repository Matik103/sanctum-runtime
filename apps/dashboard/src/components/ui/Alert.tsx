import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type Variant = 'error' | 'success' | 'info' | 'warn'

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
}

type Props = {
  variant?: Variant
  children: ReactNode
  onDismiss?: () => void
  style?: CSSProperties
}

export function Alert({ variant = 'info', children, onDismiss, style }: Props) {
  const Icon = icons[variant]
  return (
    <div className={`alert alert--${variant}`} role="alert" style={style}>
      <Icon size={18} className="alert__icon" aria-hidden />
      <div className="alert__body">{children}</div>
      {onDismiss && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}
