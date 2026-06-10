import { useState } from 'react'
import {
  Building2,
  Briefcase,
  Cpu,
  Globe,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  UserCircle,
  Zap,
  ArrowLeft,
} from 'lucide-react'
import { LegalFooter } from '../components/LegalFooter'
import { SignupTermsField } from '../components/SignupTermsField'
import { sanitizeApiError } from '../lib/sanitize-error'
import {
  getOAuthRedirectUrl,
  markOauthIntent,
  type OauthPortal,
  type OauthProvider,
} from '../lib/oauth'
import { getSupabase } from '../lib/supabase'
import {
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
  INDUSTRY_OPTIONS,
  type CompanySize,
  type Industry,
} from '../lib/signup-fields'
import { signupMetadata, validateSignupForm, type AccountKind } from '../lib/signup'
import '../styles/auth.css'

/** Default landing: short individual sign-in. Other flows expand the card. */
type AuthPanel =
  | 'signin'
  | 'signup-individual'
  | 'signup-organization'
  | 'forgot-password'
  | 'sso'

const SSO_PROVIDERS: { id: OauthProvider; label: string; hint: string }[] = [
  { id: 'google', label: 'Google', hint: 'Google Cloud / Workspace accounts' },
  { id: 'github', label: 'GitHub', hint: 'GitHub.com accounts' },
]

export function Login() {
  const [panel, setPanel] = useState<AuthPanel>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [legalName, setLegalName] = useState('')
  const [website, setWebsite] = useState('')
  const [orgCountryCode, setOrgCountryCode] = useState('')
  const [companySize, setCompanySize] = useState<CompanySize | ''>('')
  const [industry, setIndustry] = useState<Industry | ''>('')
  const [primaryContactName, setPrimaryContactName] = useState('')
  const [primaryContactTitle, setPrimaryContactTitle] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isCompact = panel === 'signin'
  const isSignup = panel === 'signup-individual' || panel === 'signup-organization'

  const resetFormErrors = () => {
    setError(null)
    setMessage(null)
  }

  const goToPanel = (next: AuthPanel, opts?: { preserveMessage?: boolean }) => {
    setPanel(next)
    setError(null)
    if (!opts?.preserveMessage) setMessage(null)
    if (next === 'signin') setAcceptedTerms(false)
  }

  const requireTermsForOauth = (): string | null => {
    if (panel === 'signup-individual' && !acceptedTerms) {
      return 'Accept the Terms of Service and Privacy Policy to continue.'
    }
    return null
  }

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    resetFormErrors()
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    const accountKind: AccountKind =
      panel === 'signup-organization' ? 'organization' : 'individual'

    if (isSignup) {
      const validationError = validateSignupForm({
        accountKind,
        email,
        password,
        confirmPassword,
        individual:
          accountKind === 'individual'
            ? { fullName, countryCode, acceptedTerms }
            : undefined,
        organization:
          accountKind === 'organization'
            ? {
                legalName,
                website,
                countryCode: orgCountryCode,
                companySize: companySize as CompanySize,
                industry: industry as Industry,
                primaryContactName,
                primaryContactTitle,
                acceptedTerms,
              }
            : undefined,
      })
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setBusy(true)
    try {
      if (isSignup) {
        const fields =
          accountKind === 'organization'
            ? {
                legalName,
                website,
                countryCode: orgCountryCode,
                companySize: companySize as CompanySize,
                industry: industry as Industry,
                primaryContactName,
                primaryContactTitle,
                acceptedTerms,
              }
            : { fullName, countryCode, acceptedTerms }

        const meta = signupMetadata(accountKind, email, fields)

        const confirmedEmail = email.trim()
        const { error: err } = await sb.auth.signUp({
          email: confirmedEmail,
          password,
          options: {
            data: meta,
            emailRedirectTo: `${window.location.origin}/?auth=confirmed`,
          },
        })
        if (err) throw err
        goToPanel('signin', { preserveMessage: true })
        setMessage(
          accountKind === 'organization'
            ? `Organization account created. Check ${confirmedEmail} for the confirmation link, then sign in to your workspace.`
            : `Account created. Check ${confirmedEmail} for the confirmation link, then sign in.`,
        )
        setPassword('')
        setConfirmPassword('')
        setAcceptedTerms(false)
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

  const submitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    resetFormErrors()
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    const targetEmail = email.trim()
    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Enter the email address for your account.')
      return
    }

    setBusy(true)
    try {
      const { error: err } = await sb.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/?auth=recovery`,
      })
      if (err) throw err
      goToPanel('signin', { preserveMessage: true })
      setMessage(
        `If an account exists for ${targetEmail}, we sent a password reset link. Check your inbox and spam folder.`,
      )
    } catch (err) {
      setError(sanitizeApiError(err, 'Could not send password reset email'))
    } finally {
      setBusy(false)
    }
  }

  const signInWithSso = async (provider: OauthProvider, portal: OauthPortal) => {
    setError(null)
    const termsErr = portal === 'operator' ? requireTermsForOauth() : null
    if (termsErr) {
      setError(termsErr)
      return
    }

    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }

    const termsAt =
      panel === 'signup-individual' && acceptedTerms ? new Date().toISOString() : undefined

    setBusy(true)
    try {
      markOauthIntent(portal, provider, termsAt)
      // OAuth cannot carry signup metadata — markOauthIntent stores it in
      // sessionStorage and applyOauthIntent stamps it after the redirect.
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
      setError(
        sanitizeApiError(
          err,
          portal === 'enterprise'
            ? 'SSO sign-in failed. Contact your administrator.'
            : 'Sign-in failed. Try again or use email and password.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const title =
    panel === 'signin'
      ? 'Operator sign in'
      : panel === 'forgot-password'
        ? 'Reset your password'
      : panel === 'signup-individual'
        ? 'Create individual account'
        : panel === 'signup-organization'
          ? 'Register your organization'
          : 'Company SSO'

  const subtitle =
    panel === 'signin'
      ? 'Access the control plane to review verifications, policies, and audit logs.'
      : panel === 'forgot-password'
        ? 'Enter your account email and we will send a secure reset link.'
      : panel === 'signup-individual'
        ? 'Personal workspace for solo operators. We collect standard identity fields for security and compliance.'
        : panel === 'signup-organization'
          ? 'Business workspace for teams. You will be the account owner and primary contact for audits and billing.'
          : 'Sign in with Google or GitHub when your admin mapped your email domain.'

  const submitLabel =
    panel === 'signin'
      ? busy
        ? 'Authenticating…'
        : 'Sign in to control plane'
      : panel === 'forgot-password'
        ? busy
          ? 'Sending reset link…'
          : 'Send reset link'
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
                <p className="auth-form-hint">
                  Use your work identity provider. Your email domain must be verified by your
                  organization administrator.
                </p>
                <div className="auth-sso-grid">
                  {SSO_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="auth-sso-btn"
                      disabled={busy}
                      title={p.hint}
                      onClick={() => void signInWithSso(p.id, 'enterprise')}
                    >
                      <Shield size={16} />
                      Continue with {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form
                onSubmit={
                  panel === 'forgot-password' ? submitPasswordReset : submitCredentials
                }
              >
                {panel === 'signup-organization' && (
                  <fieldset className="auth-fieldset">
                    <legend>Organization</legend>
                    <div className="auth-field">
                      <label htmlFor="auth-legal-name">Legal business name</label>
                      <div className="auth-input-wrap">
                        <Building2 size={16} />
                        <input
                          id="auth-legal-name"
                          className="auth-input"
                          type="text"
                          autoComplete="organization"
                          required
                          minLength={2}
                          maxLength={160}
                          placeholder="Acme Robotics Inc."
                          value={legalName}
                          onChange={(e) => setLegalName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-website">Company website</label>
                      <div className="auth-input-wrap">
                        <Globe size={16} />
                        <input
                          id="auth-website"
                          className="auth-input"
                          type="url"
                          inputMode="url"
                          autoComplete="url"
                          required
                          placeholder="https://acme.com"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="auth-field-row">
                      <div className="auth-field">
                        <label htmlFor="auth-org-country">Country or region</label>
                        <select
                          id="auth-org-country"
                          className="auth-select"
                          required
                          value={orgCountryCode}
                          onChange={(e) => setOrgCountryCode(e.target.value)}
                        >
                          <option value="" disabled>
                            Select country
                          </option>
                          {COUNTRY_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="auth-field">
                        <label htmlFor="auth-company-size">Company size</label>
                        <select
                          id="auth-company-size"
                          className="auth-select"
                          required
                          value={companySize}
                          onChange={(e) => setCompanySize(e.target.value as CompanySize)}
                        >
                          <option value="" disabled>
                            Select size
                          </option>
                          {COMPANY_SIZE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-industry">Industry</label>
                      <select
                        id="auth-industry"
                        className="auth-select"
                        required
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value as Industry)}
                      >
                        <option value="" disabled>
                          Select industry
                        </option>
                        {INDUSTRY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                )}

                {panel === 'signup-organization' && (
                  <fieldset className="auth-fieldset">
                    <legend>Primary contact (account owner)</legend>
                    <div className="auth-field">
                      <label htmlFor="auth-primary-contact">Full name</label>
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
                          placeholder="Jane Doe"
                          value={primaryContactName}
                          onChange={(e) => setPrimaryContactName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-primary-title">Job title</label>
                      <div className="auth-input-wrap">
                        <Briefcase size={16} />
                        <input
                          id="auth-primary-title"
                          className="auth-input"
                          type="text"
                          autoComplete="organization-title"
                          required
                          minLength={2}
                          maxLength={80}
                          placeholder="Head of Platform Engineering"
                          value={primaryContactTitle}
                          onChange={(e) => setPrimaryContactTitle(e.target.value)}
                        />
                      </div>
                    </div>
                  </fieldset>
                )}

                {panel === 'signup-individual' && (
                  <fieldset className="auth-fieldset">
                    <legend>Your profile</legend>
                    <div className="auth-field">
                      <label htmlFor="auth-full-name">Full legal name</label>
                      <div className="auth-input-wrap">
                        <UserCircle size={16} />
                        <input
                          id="auth-full-name"
                          className="auth-input"
                          type="text"
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={120}
                          placeholder="Jane Doe"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="auth-country">Country or region</label>
                      <select
                        id="auth-country"
                        className="auth-select"
                        required
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                      >
                        <option value="" disabled>
                          Select country
                        </option>
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                )}

                <fieldset className="auth-fieldset auth-fieldset--credentials">
                  <legend>
                    {isSignup
                      ? 'Sign-in credentials'
                      : panel === 'forgot-password'
                        ? 'Account recovery'
                        : 'Credentials'}
                  </legend>
                  <div className="auth-field">
                    <label htmlFor="auth-email">
                      {panel === 'signup-organization' ? 'Work email (account owner)' : 'Email'}
                    </label>
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

                  {panel !== 'forgot-password' && (
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
                      {panel === 'signin' && (
                        <button
                          type="button"
                          className="auth-inline-link"
                          onClick={() => goToPanel('forgot-password')}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                  )}

                  {isSignup && (
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
                </fieldset>

                {isSignup && (
                  <SignupTermsField
                    id="auth-terms"
                    checked={acceptedTerms}
                    onChange={setAcceptedTerms}
                    disabled={busy}
                  />
                )}

                <button type="submit" className="auth-submit" disabled={busy}>
                  {submitLabel}
                </button>

                {(panel === 'signin' || panel === 'signup-individual') && (
                  <>
                    <div className="auth-divider" role="separator">
                      <span>or continue with</span>
                    </div>
                    <div className="auth-sso-grid auth-sso-grid--inline">
                      {SSO_PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="auth-sso-btn auth-sso-btn--compact"
                          disabled={busy}
                          title={p.hint}
                          onClick={() => void signInWithSso(p.id, 'operator')}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
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
