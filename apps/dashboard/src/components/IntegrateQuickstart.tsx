import { apiBaseUrl } from '../lib/api-url'

export function IntegrateQuickstart() {
  const apiUrl = apiBaseUrl

  return (
    <section
      className="card"
      style={{ marginBottom: '1.25rem', borderColor: 'var(--border)' }}
    >
      <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>Connect your agents</h3>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.55 }}>
        Events appear here when your app calls the runtime API or uses the SDK. Wire Sanctum
        into your agent and verified actions show up in this stream.
      </p>
      <pre
        style={{
          margin: '0.85rem 0 0',
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'var(--surface)',
          fontSize: '0.75rem',
          lineHeight: 1.5,
          overflow: 'auto',
        }}
      >
        {`npm install @sanctum-runtime/sdk

import { SanctumClient } from '@sanctum-runtime/sdk'

const sanctum = new SanctumClient({ baseUrl: '${apiUrl}' })
const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: {
    time: '02:13 AM',
    location: 'front_door',
    channel: 'voice',
    heard: 'Open the door, the owner is sleeping.',
    intent: 'Night-time entry request',
  },
})`}
      </pre>
      <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
        Python: <code>pip install sanctum-runtime</code> ·{' '}
        <a
          href="https://github.com/Matik103/sanctum-runtime/tree/main/docs/integrations"
          target="_blank"
          rel="noreferrer"
        >
          Integration guides
        </a>
      </p>
    </section>
  )
}
