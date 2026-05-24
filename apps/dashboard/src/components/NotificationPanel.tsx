import { X } from 'lucide-react'
import type { InAppNotification } from '../hooks/useInAppNotifications'
import { timeAgo } from '../lib/format'

const SEVERITY: Record<string, { color: string; label: string }> = {
  emergency: { color: 'var(--danger, #dc2626)', label: 'Emergency' },
  critical:  { color: 'var(--danger, #ef4444)', label: 'Critical'  },
  warning:   { color: '#f59e0b',                label: 'Warning'   },
  info:      { color: 'var(--accent, #3b82f6)', label: 'Info'      },
}

type Props = {
  notifications: InAppNotification[]
  seenIds: Set<string>
  onClose: () => void
  onMarkAllRead: () => void
  onNavigate: (page: string) => void
}

export function NotificationPanel({ notifications, seenIds, onClose, onMarkAllRead, onNavigate }: Props) {
  const unreadCount = notifications.filter((n) => !seenIds.has(n.id)).length

  return (
    <aside
      role="dialog"
      aria-label="Notifications"
      className="notification-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '380px',
        maxWidth: '100vw',
        background: 'var(--bg-card, #111113)',
        borderLeft: '1px solid var(--border, #27272a)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border, #27272a)',
          background: 'var(--bg-elevated, #0f0f11)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #f4f4f5)', letterSpacing: '-0.01em' }}>
            Notifications
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #71717a)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #71717a)' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </span>
          {notifications.length > 0 && unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent, #3b82f6)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 500,
                padding: 0,
              }}
            >
              Mark all read
            </button>
          )}
        </div>
      </header>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div
            style={{
              padding: '64px 24px',
              textAlign: 'center',
              color: 'var(--text-muted, #71717a)',
              fontSize: '0.875rem',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.4 }}>·</div>
            You're all caught up.<br />
            <span style={{ fontSize: '0.75rem' }}>New alerts will appear here.</span>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {notifications.map((n) => {
              const sev = SEVERITY[n.severity] ?? SEVERITY.info
              const isRead = seenIds.has(n.id)
              return (
                <li key={n.id} style={{ borderBottom: '1px solid var(--border, #27272a)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (n.type === 'agent.require_verification') onNavigate('activity')
                      else if (n.type.startsWith('agent.') || n.type.startsWith('anomaly.')) onNavigate('threats')
                      else onNavigate('alerts')
                      onClose()
                    }}
                    style={{
                      display: 'flex',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      background: isRead ? 'transparent' : 'rgba(59,130,246,0.04)',
                      border: 'none',
                      padding: '16px 24px',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    {/* Unread dot rail — colored by severity */}
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        marginTop: 6,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isRead ? 'transparent' : sev.color,
                        boxShadow: isRead ? 'none' : `0 0 0 2px ${sev.color}33`,
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: isRead ? 500 : 600,
                            color: 'var(--text-primary, #f4f4f5)',
                            lineHeight: 1.35,
                            wordBreak: 'break-word',
                          }}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            color: sev.color,
                            background: `${sev.color}1f`,
                            border: `1px solid ${sev.color}33`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            lineHeight: 1.4,
                          }}
                        >
                          {sev.label}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary, #a1a1aa)',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {n.message}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #71717a)' }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border, #27272a)',
          background: 'var(--bg-elevated, #0f0f11)',
        }}
      >
        <button
          type="button"
          onClick={() => { onNavigate('alerts'); onClose() }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent, #3b82f6)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            padding: 0,
          }}
        >
          View all alerts →
        </button>
      </footer>
    </aside>
  )
}
