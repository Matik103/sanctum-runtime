import { X } from 'lucide-react'
import type { InAppNotification } from '../hooks/useInAppNotifications'
import { timeAgo } from '../lib/format'

const SEVERITY_COLOR: Record<string, string> = {
  emergency: 'var(--danger)',
  critical:  'var(--danger)',
  warning:   '#f59e0b',
  info:      'var(--accent)',
}

type Props = {
  notifications: InAppNotification[]
  onClose: () => void
  onMarkAllRead: () => void
  onNavigate: (page: string) => void
}

export function NotificationPanel({ notifications, onClose, onMarkAllRead, onNavigate }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '360px',
        maxWidth: '100vw',
        height: '100vh',
        background: 'var(--bg-card, #111113)',
        borderLeft: '1px solid var(--border, #27272a)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border, #27272a)' }}>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #f4f4f5)' }}>Notifications</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              style={{ background: 'none', border: 'none', color: 'var(--accent, #3b82f6)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted, #71717a)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted, #71717a)', fontSize: '0.875rem' }}>
            No notifications
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (n.type === 'agent.require_verification') onNavigate('activity')
                else if (n.type.startsWith('agent.') || n.type.startsWith('anomaly.')) onNavigate('threats')
                else onNavigate('alerts')
                onClose()
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border, #27272a)',
                padding: '14px 20px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary, #f4f4f5)', lineHeight: 1.3 }}>
                  {n.title}
                </span>
                <span style={{
                  marginLeft: '8px',
                  flexShrink: 0,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  color: SEVERITY_COLOR[n.severity] ?? '#3b82f6',
                  background: `${SEVERITY_COLOR[n.severity] ?? '#3b82f6'}22`,
                  textTransform: 'uppercase',
                }}>
                  {n.severity}
                </span>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: '0.8rem', color: 'var(--text-muted, #71717a)', lineHeight: 1.4 }}>
                {n.message}
              </p>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #71717a)' }}>
                {timeAgo(n.created_at)}
              </span>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border, #27272a)' }}>
        <button
          type="button"
          onClick={() => { onNavigate('alerts'); onClose() }}
          style={{ background: 'none', border: 'none', color: 'var(--accent, #3b82f6)', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          View all alerts →
        </button>
      </div>
    </div>
  )
}
