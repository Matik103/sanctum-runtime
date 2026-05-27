import { Eye, Radio, Wifi, WifiOff } from 'lucide-react'
import { useLiveFeed, type ProxyEvent } from '../hooks/useLiveFeed'
import { timeAgo } from '../lib/format'
import type { PageId } from '../layout/Sidebar'

const PLATFORM_LABELS: Record<string, string> = {
  openai:   'OpenAI',
  deepseek: 'DeepSeek',
  qwen:     'Qwen',
  kimi:     'Kimi',
  doubao:   'Doubao',
  gemini:   'Gemini',
}

const PLATFORM_FLAGS: Record<string, string> = {
  openai:   '🤖',
  deepseek: '🐋',
  qwen:     '☁️',
  kimi:     '🌙',
  doubao:   '🎵',
  gemini:   '✨',
}

function ArgView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span style={{ opacity: 0.4 }}>—</span>
  if (typeof value === 'string') {
    return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', opacity: 0.85 }}>{value.slice(0, 120)}{value.length > 120 ? '…' : ''}</span>
  }
  const json = JSON.stringify(value, null, 2)
  return (
    <pre style={{ margin: 0, fontSize: '0.75rem', maxHeight: 120, overflowY: 'auto', background: 'var(--surface-2, #1a1a2e)', borderRadius: '0.3rem', padding: '0.4rem 0.6rem', border: '1px solid var(--border, #2a2a3e)' }}>
      {json.length > 400 ? json.slice(0, 400) + '\n…' : json}
    </pre>
  )
}

function EventRow({ event }: { event: ProxyEvent }) {
  const ctx = event.context
  const platform = ctx.platform ?? 'unknown'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '90px 110px 1fr',
      gap: '0.75rem',
      alignItems: 'start',
      padding: '0.75rem 1rem',
      borderBottom: '1px solid var(--border, #2a2a3e)',
      fontSize: '0.82rem',
    }}>
      <div style={{ opacity: 0.55, fontSize: '0.75rem', paddingTop: '0.1rem' }}>
        {timeAgo(event.created_at)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <span>
          <span style={{ marginRight: '0.3rem' }}>{PLATFORM_FLAGS[platform] ?? '🔌'}</span>
          <span style={{ opacity: 0.8 }}>{PLATFORM_LABELS[platform] ?? platform}</span>
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', opacity: 0.5 }}>
          {String(event.actor).slice(0, 12)}…
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <code style={{ fontWeight: 600, fontSize: '0.82rem' }}>{event.action}</code>
        <ArgView value={ctx.arguments} />
      </div>
    </div>
  )
}

type Props = {
  orgId?: string | null
  onPage: (p: PageId) => void
}

export function LiveFeed({ orgId, onPage }: Props) {
  const { events, connected, loading } = useLiveFeed(orgId)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={22} strokeWidth={1.75} />
            <h1 className="page-title" style={{ margin: 0 }}>Live Feed</h1>
            <span
              title={connected ? 'Real-time connected' : 'Connecting…'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', background: connected ? 'var(--success-muted, rgba(34,197,94,0.12))' : 'var(--surface-2, #1a1a2e)', color: connected ? 'var(--success, #22c55e)' : 'var(--muted, #888)' }}
            >
              {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {connected ? 'live' : 'connecting'}
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            Tool calls your agents make — via the Sanctum proxy — appear here in real time.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onPage('connect')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
        >
          <Radio size={14} />
          Connect an agent
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 110px 1fr',
          gap: '0.75rem',
          padding: '0.6rem 1rem',
          borderBottom: '1px solid var(--border, #2a2a3e)',
          fontSize: '0.72rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          opacity: 0.5,
        }}>
          <span>When</span>
          <span>Platform</span>
          <span>Tool call</span>
        </div>

        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
            Loading…
          </div>
        )}

        {!loading && events.length === 0 && (
          <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <Eye size={32} strokeWidth={1.25} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No tool calls yet</p>
            <p style={{ fontSize: '0.83rem', opacity: 0.55, marginBottom: '1rem' }}>
              Once your agent makes a tool call through the proxy, it will appear here instantly.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onPage('connect')}
            >
              Connect your agent
            </button>
          </div>
        )}

        {!loading && events.map((e) => <EventRow key={e.id} event={e} />)}
      </div>

      {events.length > 0 && (
        <p style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '0.5rem', textAlign: 'right' }}>
          Showing last {events.length} tool calls · Updates in real time
        </p>
      )}
    </div>
  )
}
