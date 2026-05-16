import type { RuntimeStatus } from '@sanctum-runtime/sdk'

type Props = { status: RuntimeStatus | null }

export function Devices({ status }: Props) {
  const devices = [
    {
      name: 'Local dev runtime',
      model: status?.ollamaModel ?? 'qwen2.5-3b-instruct',
      online: status?.ollamaConnected ?? false,
      trust: status?.ollamaConnected ? 96 : 72,
      latency: '—',
    },
    {
      name: 'Kitchen assistant (demo)',
      model: 'Not connected',
      online: false,
      trust: 0,
      latency: '—',
    },
  ]

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Devices</h1>
          <p>Connected systems and local runtimes</p>
        </div>
      </header>

      <div className="policy-grid">
        {devices.map((d) => (
          <div key={d.name} className="policy-card">
            <h3>{d.name}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
              {d.model}
            </p>
            <p style={{ marginTop: '0.75rem' }}>
              <span className={`badge ${d.online ? 'success' : 'neutral'}`}>
                {d.online ? 'Online' : 'Offline capable'}
              </span>
            </p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Trust score: <strong>{d.trust}</strong>
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Latency: {d.latency}</p>
          </div>
        ))}
      </div>
    </>
  )
}
