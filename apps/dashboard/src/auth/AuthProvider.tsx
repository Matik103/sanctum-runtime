import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { Login } from '../pages/Login'
import '../styles/auth.css'

type AuthState = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

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

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
