import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  children?: ReactNode
}

export function EmptyState({ title, description, children }: Props) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__desc">{description}</p>}
      {children}
    </div>
  )
}
