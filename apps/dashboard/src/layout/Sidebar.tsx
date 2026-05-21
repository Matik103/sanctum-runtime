import { useState } from 'react'
import {
  Activity,
  Bell,
  CheckSquare,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Monitor,
  MoreHorizontal,
  Package,
  Radio,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { useAuth } from '../auth/AuthProvider'
import { riskModelStatusLine } from '../lib/risk-label'
import { isSupabaseConfigured } from '../lib/supabase'
import { useInAppNotifications } from '../hooks/useInAppNotifications'
import { NotificationPanel } from '../components/NotificationPanel'

export type PageId =
  | 'overview'
  | 'activity'
  | 'threats'
  | 'alerts'
  | 'policies'
  | 'policy-history'
  | 'governance'
  | 'compliance'
  | 'devices'
  | 'fleet'
  | 'marketplace'
  | 'audit'
  | 'billing'
  | 'settings'

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',       label: 'Overview',         icon: LayoutDashboard },
  { id: 'activity',       label: 'Runtime Activity',  icon: Activity },
  { id: 'threats',        label: 'Threat Monitor',    icon: ShieldAlert },
  { id: 'alerts',         label: 'Alerts',            icon: Bell },
  { id: 'policies',       label: 'Policies',          icon: Shield },
  { id: 'policy-history', label: 'Policy History',    icon: History },
  { id: 'governance',     label: 'Governance',        icon: CheckSquare },
  { id: 'compliance',     label: 'Compliance',        icon: FileText },
  { id: 'devices',        label: 'Devices',           icon: Monitor },
  { id: 'fleet',          label: 'Runtime Fleet',     icon: Radio },
  { id: 'marketplace',    label: 'Marketplace',       icon: Package },
  { id: 'audit',          label: 'Audit Logs',        icon: ScrollText },
  { id: 'billing',        label: 'Billing',           icon: CreditCard },
  { id: 'settings',       label: 'Settings',          icon: Settings },
]

type Props = {
  page: PageId
  onPage: (p: PageId) => void
  status: RuntimeStatus | null
  orgId?: string | null
}

export function Sidebar({ page, onPage, status, orgId }: Props) {
  const { user, signOut } = useAuth()
  const risk = riskModelStatusLine(status)
  const [panelOpen, setPanelOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const { notifications, unread, markAllRead } = useInAppNotifications(orgId)

  function openNotifications() {
    setMoreOpen(false)
    setPanelOpen(true)
    markAllRead()
  }

  return (
    <>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="mc-badge">
            <span className="mc-badge__dot" aria-hidden />
            Control plane
          </div>
          <div className="brand-title">Sanctum</div>
          <div className="brand-sub">Runtime Trust Layer</div>
        </div>

        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => onPage(id)}
            >
              <Icon size={17} strokeWidth={1.75} aria-hidden />
              <span className="nav-label">{label}</span>
            </button>
          ))}

          {/* Mobile-only: More button (hidden on desktop via CSS) */}
          <button
            type="button"
            className="nav-item nav-item--more"
            onClick={() => setMoreOpen(true)}
            aria-label="More options"
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MoreHorizontal size={17} strokeWidth={1.75} aria-hidden />
              {unread > 0 && (
                <span className="nav-item--more__badge" aria-hidden>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
            <span className="nav-label">More</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          {/* Notification bell */}
          <button
            type="button"
            onClick={openNotifications}
            aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              color: unread > 0 ? 'var(--text-primary, #f4f4f5)' : 'var(--muted, #71717a)',
              cursor: 'pointer',
              padding: '6px 0',
              marginBottom: '0.5rem',
              fontSize: '0.82rem',
              position: 'relative',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Bell size={16} strokeWidth={1.75} />
              {unread > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-6px',
                  background: 'var(--danger, #ef4444)',
                  color: '#fff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  minWidth: '14px',
                  height: '14px',
                  borderRadius: '7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </span>
            Notifications
          </button>

          <div style={{ marginBottom: '0.5rem' }}>
            <span className={`status-dot ${risk.dot}`} />
            {risk.label}
          </div>
          <div>
            Runtime{' '}
            <strong style={{ color: status?.runtimeOnline === false ? 'var(--danger)' : 'var(--success)' }}>
              {status?.runtimeOnline === false ? 'offline' : 'active'}
            </strong>
          </div>
          {isSupabaseConfigured && user && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
              {user.email}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ display: 'block', marginTop: '0.35rem', padding: '0.25rem 0', fontSize: '0.78rem' }}
                onClick={() => signOut()}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile "More" slide-up panel */}
      {moreOpen && (
        <>
          <div
            className="more-panel-backdrop"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="more-panel" role="dialog" aria-label="More options">
            <div className="more-panel__header">
              <span className="more-panel__title">Sanctum</span>
              <button
                type="button"
                className="more-panel__close"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Notification row */}
            <button
              type="button"
              className="more-panel__row"
              onClick={openNotifications}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Bell size={18} strokeWidth={1.75} />
                {unread > 0 && (
                  <span className="nav-item--more__badge" aria-hidden>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span>Notifications</span>
              {unread > 0 && (
                <span className="badge warning" style={{ marginLeft: 'auto', fontSize: '0.68rem' }}>
                  {unread} new
                </span>
              )}
            </button>

            {/* Runtime status */}
            <div className="more-panel__status">
              <div>
                <span className={`status-dot ${risk.dot}`} />
                {risk.label}
              </div>
              <div>
                Runtime{' '}
                <strong style={{ color: status?.runtimeOnline === false ? 'var(--danger)' : 'var(--success)' }}>
                  {status?.runtimeOnline === false ? 'offline' : 'active'}
                </strong>
              </div>
            </div>

            {/* User + sign-out */}
            {isSupabaseConfigured && user && (
              <div className="more-panel__user">
                <span className="more-panel__email">{user.email}</span>
                <button
                  type="button"
                  className="more-panel__row more-panel__row--danger"
                  onClick={() => { setMoreOpen(false); signOut() }}
                >
                  <LogOut size={18} strokeWidth={1.75} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {panelOpen && (
        <>
          <div
            onClick={() => setPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)' }}
          />
          <NotificationPanel
            notifications={notifications}
            onClose={() => setPanelOpen(false)}
            onMarkAllRead={markAllRead}
            onNavigate={(p) => onPage(p as PageId)}
          />
        </>
      )}
    </>
  )
}
