import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { LegalFooter } from '../components/LegalFooter'
import { EnterpriseOrgGate } from '../components/EnterpriseOrgGate'
import { ProfileCompletionGate } from '../components/ProfileCompletionGate'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { buildSupportPortalUrl } from '../lib/support-portal-path'
import { Login } from '../pages/Login'
import '../styles/auth.css'

type AuthState = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function PasswordRecoveryPanel({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    setBusy(true)
    try {
      const { error: err } = await sb.auth.updateUser({ password })
      if (err) throw err
      setPassword('')
      setConfirmPassword('')
      setMessage('Password updated. You can continue to the console.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-bg" aria-hidden>
        <div className="auth-bg__grid" />
        <div className="auth-bg__orb auth-bg__orb--blue" />
        <div className="auth-bg__orb auth-bg__orb--purple" />
        <div className="auth-bg__scan" />
      </div>
      <div className="auth-shell auth-shell--single">
        <div className="auth-panel">
          <div className="auth-glass auth-glass--compact">
            <h2 className="auth-form-title">Set a new password</h2>
            <p className="auth-form-sub auth-form-sub--compact">
              Your reset link is verified. Create a new password to keep your
              console access protected.
            </p>
            {error && <div className="auth-alert auth-alert--error">{error}</div>}
            {message && <div className="auth-alert auth-alert--success">{message}</div>}
            {message ? (
              <button type="button" className="auth-submit" onClick={onDone}>
                Continue to console
              </button>
            ) : (
              <form onSubmit={submit}>
                <fieldset className="auth-fieldset auth-fieldset--credentials">
                  <legend>New credentials</legend>
                  <div className="auth-field">
                    <label htmlFor="recovery-password">New password</label>
                    <input
                      id="recovery-password"
                      className="auth-input auth-input--plain"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="recovery-confirm-password">Confirm password</label>
                    <input
                      id="recovery-confirm-password"
                      className="auth-input auth-input--plain"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </fieldset>
                <button type="submit" className="auth-submit" disabled={busy}>
                  {busy ? 'Updating password…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <LegalFooter className="auth-footer" />
    </div>
  )
}

function ConfigUnavailable() {
  return (
    <div className="auth-loading" style={{ flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Console unavailable</p>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)', maxWidth: '22rem', textAlign: 'center' }}>
        Authentication is not configured for this deployment. Contact your administrator.
      </p>
    </div>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      user: null,
      session: null,
      loading: false,
      signOut: async () => {},
    }
  }
  return ctx
}

function SupportOperatorRedirect() {
  useEffect(() => {
    window.location.replace(buildSupportPortalUrl())
  }, [])
  return (
    <div className="auth-loading" style={{ flexDirection: 'column', gap: '0.75rem' }}>
      <div className="auth-loading__ring" aria-label="Redirecting to support inbox" />
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted)' }}>
        Opening support inbox…
      </p>
    </div>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) {
      setLoading(false)
      return
    }

    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = sb.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
      setSession(next)
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    const sb = getSupabase()
    if (sb) await sb.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signOut,
    }),
    [session, loading, signOut],
  )

  if (!isSupabaseConfigured) {
    if (import.meta.env.PROD) {
      return <ConfigUnavailable />
    }
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__ring" aria-label="Loading session" />
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (passwordRecovery) {
    return <PasswordRecoveryPanel onDone={() => setPasswordRecovery(false)} />
  }

  if (session.user.user_metadata?.support_operator === true) {
    return <SupportOperatorRedirect />
  }

  return (
    <AuthContext.Provider value={value}>
      <EnterpriseOrgGate>
        <ProfileCompletionGate>{children}</ProfileCompletionGate>
      </EnterpriseOrgGate>
    </AuthContext.Provider>
  )
}
