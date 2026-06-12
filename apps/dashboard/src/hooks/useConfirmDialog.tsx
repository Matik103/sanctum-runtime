import { useCallback, useState } from 'react'
import { ConfirmModal } from '../components/ui/ConfirmModal'

export type ConfirmRequest = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warn' | 'neutral'
  impact?: string[]
}

type Pending = ConfirmRequest & { resolve: (value: boolean) => void }

export function useConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback((req: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...req, resolve })
    })
  }, [])

  const close = useCallback((result: boolean) => {
    setPending((p) => {
      p?.resolve(result)
      return null
    })
  }, [])

  function ConfirmDialog() {
    if (!pending) return null
    return (
      <ConfirmModal
        open
        title={pending.title}
        message={pending.message}
        confirmLabel={pending.confirmLabel}
        cancelLabel={pending.cancelLabel}
        variant={pending.variant}
        impact={pending.impact}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    )
  }

  return { confirm, ConfirmDialog }
}
