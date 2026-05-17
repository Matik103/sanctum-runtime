import { useState } from 'react'
import {
  Building2,
  Cpu,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react'
import { docsUrl } from '../lib/site-links'
import { getSupabase } from '../lib/supabase'
import '../styles/auth.css'

type Portal = 'operator' | 'enterprise'
type AuthTab = 'signin' | 'signup'

const SSO_PROVIDERS = [
  { id: 'google' as const, label: 'Google Workspace' },
  { id: 'azure' as const, label: 'Microsoft Entra ID' },
  { id: 'github' as const, label: 'GitHub Enterprise' },
]

export function Login() {
  const [portal, setPortal] = useState<Portal>('operator')
  const [tab, setTab] = useState<AuthTab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    setBusy(true)
    try {
      if (tab === 'signup') {
        const { error: err } = await sb.auth.signUp({
          email,
          password,
          options: { data: { portal_type: 'operator', auth_provider: 'email' } },
        })
        if (err) throw err
        setMessage('Account created. Check your email if confirmation is required, then sign in.')
        setTab('signin')
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email, password })
        if (err) throw err
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  const signInWithSso = async (provider: 'google' | 'github' | 'azure') => {
    setError(null)
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    setBusy(true)
    try {
      const { error: err } = await sb.auth.signInWithOAuth({
        provider: provider === 'azure' ? 'azure' : provider,
        options: {
          redirectTo: window.location.origin,
          data: { portal_type: 'enterprise', auth_provider: provider },
        },
      })
      if (err) throw err
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO sign-in failed. Contact your administrator.')
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

      <div className="auth-shell">
        <aside className="auth-brand">
          <div className="auth-brand__badge">
            <span className="auth-brand__badge-dot" />
            Runtime online
          </div>
          <h1>
            Mission control for <span>trusted AI</span>
          </h1>
          <p className="auth-brand__tagline">
            Sanctum Runtime gates every autonomous action — agents, robots, and
            infrastructure — before it touches the physical world.
          </p>

          <div className="auth-brand__stats">
            <div className="auth-stat">
              <div className="auth-stat__label">Policy engine</div>
              <div className="auth-stat__value">Live</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat__label">Verification</div>
              <div className="auth-stat__value">HITL</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat__label">Audit trail</div>
              <div className="auth-stat__value">Synced</div>
            </div>
          </div>

          <ul className="auth-features">
            <li className="auth-feature">
              <ShieldCheck size={16} strokeWidth={2} />
              Action verification before execution
            </li>
            <li className="auth-feature">
              <Cpu size={16} strokeWidth={2} />
              Policies persist across deploys
            </li>
            <li className="auth-feature">
              <Zap size={16} strokeWidth={2} />
              Webhooks + human review queue
            </li>
          </ul>
        </aside>

        <div className="auth-panel">
          <div className="auth-glass">
            <div className="auth-mode-switch" role="tablist" aria-label="Portal type">
              <button
                type="button"
                role="tab"
                aria-selected={portal === 'operator'}
                className={`auth-mode-btn ${portal === 'operator' ? 'active' : ''}`}
                onClick={() => {
                  setPortal('operator')
                  setError(null)
                }}
              >
                <User size={15} />
                Operator
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={portal === 'enterprise'}
                className={`auth-mode-btn ${portal === 'enterprise' ? 'active' : ''}`}
                onClick={() => {
                  setPortal('enterprise')
                  setError(null)
                }}
              >
                <Building2 size={15} />
                Enterprise
              </button>
            </div>

            {portal === 'operator' ? (
              <>
                <div className="auth-tabs" role="tablist" aria-label="Authentication">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'signin'}
                    className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
                    onClick={() => {
                      setTab('signin')
                      setError(null)
                      setMessage(null)
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'signup'}
                    className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
                    onClick={() => {
                      setTab('signup')
                      setError(null)
                      setMessage(null)
                    }}
                  >
                    Create account
                  </button>
                </div>

                <h2 className="auth-form-title">
                  {tab === 'signin' ? 'Operator sign in' : 'Create operator account'}
                </h2>
                <p className="auth-form-sub">
                  {tab === 'signin'
                    ? 'Access the control plane to review verifications, policies, and audit logs.'
                    : 'Register with your work email. Minimum 6 characters for password.'}
                </p>

                {error && <div className="auth-alert auth-alert--error">{error}</div>}
                {message && (
                  <div className="auth-alert auth-alert--success">{message}</div>
                )}

                <form onSubmit={submitCredentials}>
                  <div className="auth-field">
                    <label htmlFor="auth-email">Email</label>
                    <div className="auth-input-wrap">
                      <Mail size={16} />
                      <input
                        id="auth-email"
                        className="auth-input"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="auth-field">
                    <label htmlFor="auth-password">Password</label>
                    <div className="auth-input-wrap">
                      <Lock size={16} />
                      <input
                        id="auth-password"
                        className="auth-input"
                        type="password"
                        autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="auth-submit" disabled={busy}>
                    {busy
                      ? 'Authenticating…'
                      : tab === 'signin'
                        ? 'Sign in to control plane'
                        : 'Create account'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 className="auth-form-title">Enterprise SSO</h2>
                <p className="auth-form-sub">
                  Sign in with your organization&apos;s identity provider.
                </p>

                {error && <div className="auth-alert auth-alert--error">{error}</div>}

                <div className="auth-sso-grid">
                  {SSO_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="auth-sso-btn"
                      disabled={busy}
                      onClick={() => void signInWithSso(p.id)}
                    >
                      <Shield size={16} />
                      Continue with {p.label}
                    </button>
                  ))}
                </div>

                <div className="auth-divider">or</div>

                <p className="auth-form-sub" style={{ marginBottom: '0.75rem' }}>
                  Operator credentials (fallback)
                </p>
                <button
                  type="button"
                  className="auth-sso-btn"
                  onClick={() => setPortal('operator')}
                >
                  <User size={16} />
                  Use email & password
                </button>

              </>
            )}
          </div>
        </div>
      </div>

      <footer className="auth-footer">
        Sanctum Runtime · Trusted execution layer ·{' '}
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#93b4ff' }}
        >
          Documentation
        </a>
      </footer>
    </div>
  )
}
