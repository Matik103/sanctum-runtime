import { useEffect, type ReactNode } from 'react'
import { Headphones, LogOut } from 'lucide-react'
import { useSupportPortalAuth } from '../auth/SupportPortalAuthProvider'
import '../styles/support-portal.css'

type Props = {
  children: ReactNode
}

export function SupportPortalShell({ children }: Props) {
  const { user, signOut } = useSupportPortalAuth()
  const displayName =
    (typeof user?.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    'Support operator'

  useEffect(() => {
    document.body.classList.add('support-portal-body')
    return () => document.body.classList.remove('support-portal-body')
  }, [])

  return (
    <div className="support-portal">
      <header className="support-portal__header">
        <div className="support-portal__brand">
          <Headphones size={18} aria-hidden />
          <div>
            <p className="support-portal__title">Sanctum Support</p>
            <p className="support-portal__subtitle">
              {displayName} · visitor conversations
            </p>
          </div>
        </div>
        <div className="support-portal__actions">
          {user?.email ? (
            <span className="support-portal__email">{user.email}</span>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>
      <main className="support-portal__main">{children}</main>
    </div>
  )
}
