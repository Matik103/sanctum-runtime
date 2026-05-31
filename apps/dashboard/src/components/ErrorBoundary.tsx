import { Component, type ReactNode } from 'react'
import { apiBaseUrl } from '../lib/api-url'

type Props = { children: ReactNode; fallback?: ReactNode; page?: string }
type State = { error: Error | null }

function isModuleLoadError(error: Error): boolean {
  return /importing a module script failed|failed to fetch dynamically imported module|loading chunk|module script/i
    .test(error.message)
}

async function refreshInstalledApp(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((registrations ?? []).map((registration) => registration.update()))
  } catch {
    /* best effort */
  }
  try {
    const keys = await caches?.keys?.()
    await Promise.all((keys ?? []).map((key) => caches.delete(key)))
  } catch {
    /* best effort */
  }
  window.location.assign(`/index.html?source=recover&ts=${Date.now()}`)
}

/**
 * Sends a structured error report to the API's /v1/client-errors endpoint.
 * Fire-and-forget — we never let the report itself throw or block the render.
 * The API rate-limits this endpoint at 30 req/min and caps body size at 8 KiB,
 * so we truncate large stacks here before transmission.
 */
function reportClientError(
  error: Error,
  info: { componentStack: string },
  page: string | undefined,
): void {
  try {
    const payload = {
      page,
      message:        error.message.slice(0, 500),
      stack:          (error.stack ?? '').slice(0, 3500),
      componentStack: info.componentStack.slice(0, 3500),
      userAgent:      navigator.userAgent.slice(0, 300),
      href:           window.location.href.slice(0, 500),
      buildId:        (import.meta.env.VITE_BUILD_ID as string | undefined)?.slice(0, 80),
    }
    // Use sendBeacon when available so the report survives page unloads.
    const url = `${apiBaseUrl}/v1/client-errors`
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(payload))
    } else {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    }
  } catch {
    // Never let reporting crash the app further.
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Structured console output for local dev / source-mapped traces
    console.error(
      `[ErrorBoundary${this.props.page ? `:${this.props.page}` : ''}]`,
      error,
      info.componentStack,
    )
    // Forward to API so production errors surface in the server log stream
    reportClientError(error, info, this.props.page)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      const moduleLoadError = isModuleLoadError(this.state.error)
      return (
        <div
          role="alert"
          style={{
            padding: '2rem',
            margin: '1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--danger, #ef4444)',
            background: 'color-mix(in srgb, var(--danger, #ef4444) 10%, transparent)',
          }}
        >
          <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
            {this.props.page ? `${this.props.page} failed to load` : 'Something went wrong'}
          </p>
          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--muted)',
              margin: '0 0 1rem',
              fontFamily: 'monospace',
              wordBreak: 'break-word',
            }}
          >
            {moduleLoadError
              ? 'This installed app has an old cached screen bundle. Refresh the app to fetch the current console.'
              : this.state.error.message}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (moduleLoadError) void refreshInstalledApp()
              else this.setState({ error: null })
            }}
          >
            {moduleLoadError ? 'Refresh app' : 'Try again'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
