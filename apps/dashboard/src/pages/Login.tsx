import { useState } from 'react'
import {
  Building2,
  Cpu,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  UserCircle,
  Zap,
  ArrowLeft,
} from 'lucide-react'
import { LegalFooter } from '../components/LegalFooter'
import { sanitizeApiError } from '../lib/sanitize-error'
import { getOAuthRedirectUrl, markOauthIntent, type OauthProvider } from '../lib/oauth'
import { getSupabase } from '../lib/supabase'
import { signupMetadata, validateSignupForm, type AccountKind } from '../lib/signup'
import '../styles/auth.css'

/** Default landing: short individual sign-in. Other flows expand the card. */
type AuthPanel = 'signin' | 'signup-individual' | 'signup-organization' | 'sso'

const SSO_PROVIDERS: { id: OauthProvider; label: string; hint: string }[] = [
  { id: 'google', label: 'Google', hint: 'Google Cloud / Workspace accounts' },
  { id: 'github', label: 'GitHub', hint: 'GitHub.com accounts' },
]

export function Login() {
  const [panel, setPanel] = useState<AuthPanel>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [primaryContactName, setPrimaryContactName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isCompact = panel === 'signin'

  const resetFormErrors = () => {
    setError(null)
    setMessage(null)
  }

  const goToPanel = (next: AuthPanel) => {
    setPanel(next)
    resetFormErrors()
  }

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    resetFormErrors()
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    const isSignup = panel === 'signup-individual' || panel === 'signup-organization'
    const accountKind: AccountKind =
      panel === 'signup-organization' ? 'organization' : 'individual'

    if (isSignup) {
      const validationError = validateSignupForm({
        accountKind,
        email,
        password,
        confirmPassword,
        organizationName,
        primaryContactName,
      })
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setBusy(true)
    try {
      if (isSignup) {
        const meta =
          accountKind === 'organization'
            ? signupMetadata('organization', { organizationName, primaryContactName })
            : signupMetadata('individual', {})

        const { error: err } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: meta },
        })
        if (err) throw err
        setMessage(
          accountKind === 'organization'
            ? 'Organization account created. Confirm your email if required, then sign in.'
            : 'Account created. Confirm your email if required, then sign in.',
        )
        setPassword('')
        setConfirmPassword('')
        goToPanel('signin')
      } else {
        const { error: err } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (err) throw err
      }
    } catch (err) {
      setError(sanitizeApiError(err, 'Authentication failed'))
    } finally {
      setBusy(false)
    }
  }

  const signInWithSso = async (provider: OauthProvider) => {
    setError(null)
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    setBusy(true)
    try {
      markOauthIntent('enterprise', provider)
      const { error: err } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectUrl(),
          ...(provider === 'google'
            ? { queryParams: { prompt: 'select_account' } }
            : { scopes: 'read:user user:email' }),
        },
      })
      if (err) throw err
    } catch (err) {
      setError(sanitizeApiError(err, 'SSO sign-in failed. Contact your administrator.'))
    } finally {
      setBusy(false)
    }
  }

  const title =
    panel === 'signin'
      ? 'Operator sign in'
      : panel === 'signup-individual'
        ? 'Create individual account'
        : panel === 'signup-organization'
          ? 'Register your organization'
          : 'Company SSO'

  const subtitle =
    panel === 'signin'
      ? 'Access the control plane to review verifications, policies, and audit logs.'
      : panel === 'signup-individual'
        ? 'Personal workspace for solo operators and developers.'
        : panel === 'signup-organization'
          ? 'You will be the account owner (primary contact).'
          : 'Sign in with Google or GitHub when your admin mapped your email domain.'

  const submitLabel =
    panel === 'signin'
      ? busy
        ? 'Authenticating…'
        : 'Sign in to control plane'
      : panel === 'signup-individual'
        ? busy
          ? 'Please wait…'
          : 'Create individual account'
        : panel === 'signup-organization'
          ? busy
            ? 'Please wait…'
            : 'Create organization account'
          : ''

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
          <div className={`auth-glass ${isCompact ? 'auth-glass--compact' : 'auth-glass--expanded'}`}>
            {!isCompact && (
              <button
                type="button"
                className="auth-back"
                onClick={() => goToPanel('signin')}
              >
                <ArrowLeft size={14} />
                Back to sign in
              </button>
            )}

            <h2 className="auth-form-title">{title}</h2>
            <p className={`auth-form-sub ${isCompact ? 'auth-form-sub--compact' : ''}`}>{subtitle}</p>

            {error && <div className="auth-alert auth-alert--error">{error}</div>}
            {message && <div className="auth-alert auth-alert--success">{message}</div>}

            {panel === 'sso' ? (
              <div className="auth-sso-panel">
                <div className="auth-sso-grid">
                  {SSO_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="auth-sso-btn"
                      disabled={busy}
                      title={p.hint}
                      onClick={() => void signInWithSso(p.id)}
                    >
                      <Shield size={16} />
                      Continue with {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form onSubmit={submitCredentials}>
                {panel === 'signup-organization' && (
                  <>
                    <div className="auth-field">
                      <label htmlFor="auth-org-name">Organization name</label>
                      <div className="auth-input-wrap">
                        <Building2 size={16} />
                        <input
                          id="auth-org-name"
                          className="auth-input"
                          type="text"
                          autoComplete="organization"
                          required
                          minLength={2}
                          maxLength={120}
                          placeholder="Acme Robotics Inc."
                          value={organizationName}
                          onChange={(e) => setOrganizationName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-primary-contact">Primary contact (account owner)</label>
                      <div className="auth-input-wrap">
                        <UserCircle size={16} />
                        <input
                          id="auth-primary-contact"
                          className="auth-input"
                          type="text"
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={120}
                          placeholder="Full name of person in charge"
                          value={primaryContactName}
                          onChange={(e) => setPrimaryContactName(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

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
                      autoComplete={
                        panel === 'signin' ? 'current-password' : 'new-password'
                      }
                      required
                      minLength={panel === 'signin' ? 6 : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {panel !== 'signin' && (
                  <div className="auth-field">
                    <label htmlFor="auth-confirm-password">Confirm password</label>
                    <div className="auth-input-wrap">
                      <Lock size={16} />
                      <input
                        id="auth-confirm-password"
                        className="auth-input"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="auth-submit" disabled={busy}>
                  {submitLabel}
                </button>
              </form>
            )}

            {isCompact && (
              <nav className="auth-compact-nav" aria-label="More sign-in options">
                <button
                  type="button"
                  className="auth-compact-nav__link"
                  onClick={() => goToPanel('signup-individual')}
                >
                  Create account
                </button>
                <span className="auth-compact-nav__sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="auth-compact-nav__link"
                  onClick={() => goToPanel('signup-organization')}
                >
                  Register organization
                </button>
                <span className="auth-compact-nav__sep" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="auth-compact-nav__link"
                  onClick={() => goToPanel('sso')}
                >
                  Company SSO
                </button>
              </nav>
            )}
          </div>
        </div>
      </div>

      <LegalFooter className="auth-footer" />
    </div>
  )
}
