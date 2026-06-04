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
  const userId = user?.id ?? null
  const [checking, setChecking] = useState(true)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [portalType, setPortalType] = useState<'operator' | 'enterprise' | null>(null)
  const [orgCount, setOrgCount] = useState(0)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    setChecking(true)
    setCheckError(null)
    if (!userId || !user) {
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
        const state = await Promise.race([
          completeEnterpriseSignIn(sb, user),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('workspace_bootstrap_timeout')), 12_000)
          }),
        ])
        if (cancelled) return
        setPortalType(state.portalType)
        setOrgCount(state.orgs.length)
        setEmail(user.email ?? null)
      } catch {
        if (!cancelled) {
          setCheckError('Workspace access could not be verified. Check your connection and retry.')
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId, retryAttempt])

  if (checking) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__ring" aria-label="Loading workspace" />
      </div>
    )
  }

  if (checkError) {
    return (
      <div className="auth-loading" style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>Workspace unavailable</p>
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--muted)',
            maxWidth: '26rem',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {checkError}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={() => setRetryAttempt((n) => n + 1)}>
            Retry
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
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
          You signed in with Company SSO
          {email ? ` as ${email}` : ''}, but your email domain
          {domain ? ` (@${domain})` : ''} is not verified for your organization yet. Ask an
          administrator to add and verify the domain under{' '}
          <strong>Settings → Company SSO domains</strong>, or use individual sign-up for a personal
          workspace.
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
