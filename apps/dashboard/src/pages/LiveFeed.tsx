import { Wifi, WifiOff, AlertCircle } from 'lucide-react'
import { useLiveFeed } from '../hooks/useLiveFeed'
import { timeAgo } from '../lib/format'
import type { PageId } from '../layout/Sidebar'

type Props = { orgId: string | null; onPage: (p: PageId) => void }

export function LiveFeed({ orgId, onPage }: Props) {
  const { events, connected, realtimeStatus, loading, fetchError } = useLiveFeed(orgId)

  const statusIndicator = connected
    ? { icon: <Wifi size={14} />, label: 'Live', color: 'var(--success)' }
    : realtimeStatus === 'unavailable'
      ? { icon: <AlertCircle size={14} />, label: 'Real-time unavailable', color: '#f59e0b' }
      : { icon: <WifiOff size={14} />, label: 'Connecting…', color: 'var(--muted)' }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Live Feed</h1>
          <p>Real-time tool calls from agents routed through the Sanctum proxy.</p>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: statusIndicator.color }}>
          {statusIndicator.icon} {statusIndicator.label}
        </span>
      </header>

      {realtimeStatus === 'unavailable' && (
        <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
          <div className="alert__body">
            Real-time updates are unavailable — run the Supabase migration to enable them.
            New events will appear on page refresh.
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading…</p>}

      {fetchError && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: '1rem' }}>
          <div className="alert__body">{fetchError}</div>
        </div>
      )}

      {!loading && !fetchError && events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--muted)' }}>
          <p style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>No proxy events yet</p>
          <p style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Route your agent through Sanctum to see its tool calls here.
          </p>
          <button type="button" className="response-btn" onClick={() => onPage('connect')} style={{ fontSize: '0.85rem' }}>
            Connect an agent →
          </button>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>Time</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>Platform</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>Agent</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>Tool call</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>Arguments</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {timeAgo(e.created_at)}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textTransform: 'capitalize' }}>
                    {e.context.platform ?? '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.77rem', color: 'var(--muted)' }}>
                    {e.actor}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                    {e.action}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--muted)', maxWidth: 320 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.context.arguments != null ? JSON.stringify(e.context.arguments) : '—'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
