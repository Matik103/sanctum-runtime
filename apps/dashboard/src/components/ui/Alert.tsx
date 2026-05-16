import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'

type Variant = 'error' | 'success' | 'info'

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
}

type Props = {
  variant?: Variant
  children: ReactNode
  onDismiss?: () => void
}

export function Alert({ variant = 'info', children, onDismiss }: Props) {
  const Icon = icons[variant]
  return (
    <div className={`alert alert--${variant}`} role="alert">
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
