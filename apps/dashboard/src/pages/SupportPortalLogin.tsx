import { useState, type FormEvent } from 'react'
import { Headphones, Mail, Lock } from 'lucide-react'
import { LegalFooter } from '../components/LegalFooter'
import { sanitizeApiError } from '../lib/sanitize-error'
import { getSupabase } from '../lib/supabase'
import '../styles/auth.css'

export function SupportPortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const sb = getSupabase()
    if (!sb) {
      setError('Authentication is not configured on this deployment.')
      return
    }
    setBusy(true)
    try {
      const { error: err } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) throw err
    } catch (err) {
      setError(sanitizeApiError(err, 'Sign in failed'))
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Headphones size={22} style={{ color: 'var(--primary)' }} />
              <div>
                <h2 className="auth-form-title" style={{ margin: 0 }}>
                  Sanctum Guide · Support
                </h2>
                <p className="auth-form-sub auth-form-sub--compact" style={{ margin: '4px 0 0' }}>
                  Operator portal for marketing-site visitor chats. Not the runtime console.
                </p>
              </div>
            </div>
            {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
            <form onSubmit={submit}>
              <fieldset className="auth-fieldset auth-fieldset--credentials">
                <legend>Team sign-in</legend>
                <div className="auth-field">
                  <label htmlFor="support-email">
                    <Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                    Work email
                  </label>
                  <input
                    id="support-email"
                    className="auth-input auth-input--plain"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="auth-field">
                  <label htmlFor="support-password">
                    <Lock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                    Password
                  </label>
                  <input
                    id="support-password"
                    className="auth-input auth-input--plain"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </fieldset>
              <button type="submit" className="auth-submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Open support inbox'}
              </button>
            </form>
            <p className="auth-form-sub auth-form-sub--compact" style={{ marginTop: 16, opacity: 0.75 }}>
              Need runtime fleet access? Use the{' '}
              <a href="/" style={{ color: 'var(--primary)' }}>
                operator console
              </a>
              .
            </p>
          </div>
        </div>
      </div>
      <LegalFooter className="auth-footer" />
    </div>
  )
}
