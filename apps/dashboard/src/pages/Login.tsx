import { useState } from 'react'
import { getSupabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    const sb = getSupabase()
    if (!sb) {
      setError('Supabase is not configured in .env')
      return
    }

    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error: err } = await sb.auth.signUp({ email, password })
        if (err) throw err
        setMessage('Check your email to confirm your account (if confirmation is enabled).')
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

  return (
    <div
      className="shell"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.35rem' }}>Sanctum Runtime</h1>
        <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Sign in to your control plane
        </p>

        <form onSubmit={submit}>
          <label className="card-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', marginBottom: '0.85rem' }}
          />

          <label className="card-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', marginBottom: '1rem' }}
          />

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}
          {message && (
            <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {message}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: 0, fontSize: 'inherit' }}
                onClick={() => setMode('signup')}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: 0, fontSize: 'inherit' }}
                onClick={() => setMode('signin')}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
