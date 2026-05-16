import type { ReactNode } from 'react'

export function PageActions({ children }: { children: ReactNode }) {
  return <div className="page-actions">{children}</div>
}
