import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { completeEnterpriseSignIn } from '../lib/enterprise-auth'
import { getSupabase } from '../lib/supabase'

type Props = { children: ReactNode }

/**
 * Ensures enterprise SSO users are joined to a domain-mapped org before showing the shell.
 */
export function EnterpriseOrgGate({ children }: Props) {
  const { user, signOut } = useAuth()
  const [checking, setChecking] = useState(true)
  const [portalType, setPortalType] = useState<'operator' | 'enterprise' | null>(null)
  const [orgCount, setOrgCount] = useState(0)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setChecking(false)
      return
    }

    const sb = getSupabase()
    if (!sb) {
      setChecking(false)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const state = await completeEnterpriseSignIn(sb, user)
        if (cancelled) return
        setPortalType(state.portalType)
        setOrgCount(state.orgs.length)
        setEmail(user.email ?? null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  if (checking) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__ring" aria-label="Loading workspace" />
      </div>
    )
  }

  if (portalType === 'enterprise' && orgCount === 0) {
    const domain = email?.includes('@') ? email.split('@')[1] : null
    return (
      <div className="auth-loading" style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>No organization access</p>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--muted)',
            maxWidth: '26rem',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          You signed in with Enterprise SSO
          {email ? ` as ${email}` : ''}, but your email domain
          {domain ? ` (@${domain})` : ''} is not linked to a Sanctum organization yet. Ask your
          administrator to add your domain in <code className="inline-code">organization_domains</code>,
          or use <strong>Operator</strong> sign-up if you need a personal workspace.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
