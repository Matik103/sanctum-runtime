import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack)
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          padding: '2rem',
          margin: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--danger, #ef4444)',
          background: 'color-mix(in srgb, var(--danger, #ef4444) 10%, transparent)',
        }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>Something went wrong</p>
          {import.meta.env.DEV && (
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 1rem', fontFamily: 'monospace' }}>
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
