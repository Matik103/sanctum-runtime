import { apiBaseUrl } from '../lib/api-url'

export function Phase3Onboarding() {
  const apiUrl = apiBaseUrl

  return (
    <section className="card panel-glass alert--info" style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>Bring your control plane online</h3>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.55 }}>
        Connect a runtime or send a sample action so operators can review approvals, blocks, and audit
        evidence from this dashboard.
      </p>
      <ol
        style={{
          margin: '0.75rem 0 0',
          paddingLeft: '1.2rem',
          fontSize: '0.85rem',
          color: 'var(--muted)',
          lineHeight: 1.65,
        }}
      >
        <li>
          Create or copy a scoped API key from Devices.
        </li>
        <li>
          Send a sample action with your runtime or SDK:{' '}
          <code style={{ fontSize: '0.78rem' }}>
            SANCTUM_API_URL={apiUrl} SANCTUM_API_KEY=… npm run seed:production
          </code>
        </li>
        <li>
          Use <strong style={{ color: 'var(--text)' }}>Review next</strong> when an action needs a human decision.
        </li>
      </ol>
    </section>
  )
}
