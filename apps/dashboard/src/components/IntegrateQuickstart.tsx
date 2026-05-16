export function IntegrateQuickstart() {
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

const sanctum = new SanctumClient({ baseUrl: 'http://127.0.0.1:3001' })
const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'send_email',
  context: { to: 'user@example.com' },
})`}
      </pre>
      <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
        From the repo: <code>npm run example:agent</code> · <code>npm run smoke</code> · see{' '}
        <a href="https://github.com/Matik103/sanctum-runtime#readme" target="_blank" rel="noreferrer">
          README
        </a>
      </p>
    </section>
  )
}
