import { useEffect, useState, type ReactNode } from 'react'
import { UserCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { SignupTermsField } from './SignupTermsField'
import { fetchAccountProfile, updateAccountProfile } from '../lib/org-profile'
import { COUNTRY_OPTIONS, TERMS_VERSION } from '../lib/signup-fields'
import { privacyUrl, termsUrl } from '../lib/site-links'

type Props = { children: ReactNode }

/**
 * Post-auth profile completion (OAuth / incomplete signup) — standard B2B onboarding gate.
 */
export function ProfileCompletionGate({ children }: Props) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [needsCompletion, setNeedsCompletion] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setChecking(false)
      return
    }
    void fetchAccountProfile()
      .then((p) => {
        const incomplete =
          p &&
          (p.complete === false ||
            (p.missing?.length ?? 0) > 0 ||
            !p.country_code ||
            (p.display_name?.trim().length ?? 0) < 2)
        if (!incomplete) {
          setNeedsCompletion(false)
          return
        }
        setNeedsCompletion(true)
        setDisplayName(p.display_name ?? user.user_metadata?.full_name ?? '')
        setCountryCode(p.country_code ?? '')
        setAcceptedTerms(Boolean(p.accepted_terms_at))
      })
      .catch(() => setNeedsCompletion(false))
      .finally(() => setChecking(false))
  }, [user?.id])

  const submit = async () => {
    setError(null)
    if (displayName.trim().length < 2) {
      setError('Enter your full legal name.')
      return
    }
    if (!countryCode) {
      setError('Select your country or region.')
      return
    }
    if (!acceptedTerms) {
      setError('Accept the Terms of Service and Privacy Policy to continue.')
      return
    }

    setBusy(true)
    try {
      const patch: Parameters<typeof updateAccountProfile>[0] = {
        display_name: displayName.trim(),
        country_code: countryCode,
        accept_terms: acceptedTerms,
      }
      const updated = await updateAccountProfile(patch)
      if (!updated.complete) {
        setError('Profile still incomplete. Contact support if this persists.')
        return
      }
      setNeedsCompletion(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__ring" aria-label="Loading profile" />
      </div>
    )
  }

  if (!needsCompletion) return <>{children}</>

  return (
    <div className="auth-root">
      <div className="auth-bg" aria-hidden>
        <div className="auth-bg__grid" />
      </div>
      <div className="auth-shell auth-shell--centered">
        <div className="auth-glass auth-glass--expanded" style={{ maxWidth: '28rem' }}>
          <h2 className="auth-form-title">
            <UserCircle size={20} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
            Complete your profile
          </h2>
          <p className="auth-form-sub">
            We need a few standard identity fields for security, billing, and compliance before you
            access the control plane.
          </p>

          {error && <div className="auth-alert auth-alert--error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="complete-full-name" className="settings-label">
              Full legal name
            </label>
            <input
              id="complete-full-name"
              className="input auth-input"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="complete-country" className="settings-label">
              Country or region
            </label>
            <select
              id="complete-country"
              className="auth-select"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              style={{ width: '100%' }}
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

          {!acceptedTerms && (
            <SignupTermsField
              id="complete-terms"
              checked={acceptedTerms}
              onChange={setAcceptedTerms}
              disabled={busy}
            />
          )}
          {acceptedTerms && (
            <p className="hint-line">
              Terms accepted ({TERMS_VERSION}).{' '}
              <a href={termsUrl} target="_blank" rel="noopener noreferrer">
                Terms
              </a>{' '}
              ·{' '}
              <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
                Privacy
              </a>
            </p>
          )}

          <button type="button" className="auth-submit" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : 'Continue to control plane'}
          </button>
        </div>
      </div>
    </div>
  )
}
