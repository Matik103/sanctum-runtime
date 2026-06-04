import { apiBaseUrl } from '../lib/api-url'

export function Phase3Onboarding() {
  const apiUrl = apiBaseUrl

  return (
    <section className="card panel-glass alert--info" style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>Phase 3 — populate the control plane</h3>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.55 }}>
        The runtime is connected. Seed demo audit events from your machine, then review verifications in
        this dashboard.
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
          Create or copy a scoped <strong style={{ color: 'var(--text)' }}>SANCTUM_API_KEY</strong> from
          Devices.
        </li>
        <li>
          Run:{' '}
          <code style={{ fontSize: '0.78rem' }}>
            SANCTUM_API_URL={apiUrl} SANCTUM_API_KEY=… npm run seed:production
          </code>
        </li>
        <li>
          Refresh this page — use <strong style={{ color: 'var(--text)' }}>Review next</strong> for HITL
          (shortcuts <kbd>A</kbd> / <kbd>D</kbd>)
        </li>
      </ol>
      <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
        <a
          href="https://github.com/Matik103/sanctum-runtime/blob/main/PHASE_3.md"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#93b4ff' }}
        >
          Full Phase 3 checklist
        </a>
      </p>
    </section>
  )
}
