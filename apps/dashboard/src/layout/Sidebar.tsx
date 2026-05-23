import { useState } from 'react'
import {
  Activity,
  Bell,
  Bot,
  CheckSquare,
  CreditCard,
  FileText,
  GitBranch,
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
  ShieldCheck,
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
  | 'workflow-builder'
  | 'assurance'
  | 'governance'
  | 'compliance'
  | 'agents'
  | 'devices'
  | 'fleet'
  | 'marketplace'
  | 'audit'
  | 'billing'
  | 'settings'

/** Reduced nav for mobile companion (installed PWA / narrow viewport). */
export const COMPANION_NAV_IDS: PageId[] = [
  'overview',
  'activity',
  'threats',
  'alerts',
  'settings',
]

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview',       label: 'Overview',         icon: LayoutDashboard },
  { id: 'activity',       label: 'Runtime Activity',  icon: Activity },
  { id: 'threats',        label: 'Threat Monitor',    icon: ShieldAlert },
  { id: 'alerts',         label: 'Alerts',            icon: Bell },
  { id: 'policies',       label: 'Policies',          icon: Shield },
  { id: 'policy-history', label: 'Policy History',    icon: History },
  { id: 'workflow-builder', label: 'Workflow Builder', icon: GitBranch },
  { id: 'assurance',      label: 'Assurance',         icon: ShieldCheck },
  { id: 'governance',     label: 'Governance',        icon: CheckSquare },
  { id: 'compliance',     label: 'Compliance',        icon: FileText },
  { id: 'agents',         label: 'Agents',            icon: Bot },
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
  companionMode?: boolean
}

export function Sidebar({ page, onPage, status, orgId, companionMode }: Props) {
  const { user, signOut } = useAuth()
  const risk = riskModelStatusLine(status)
  const [panelOpen, setPanelOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const { notifications, unread, markAllRead } = useInAppNotifications(orgId)
  const navItems = companionMode ? NAV.filter((n) => COMPANION_NAV_IDS.includes(n.id)) : NAV
  const overflowItems = companionMode ? NAV.filter((n) => !COMPANION_NAV_IDS.includes(n.id)) : []

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
            {companionMode ? 'Companion' : 'Control plane'}
          </div>
          <div className="brand-title">Sanctum</div>
          <div className="brand-sub">{companionMode ? 'Mobile trust layer' : 'Runtime Trust Layer'}</div>
        </div>

        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
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
            className={`nav-item nav-item--more ${overflowItems.some((item) => item.id === page) ? 'active' : ''}`}
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
          {/* Notifications row */}
          <button
            type="button"
            onClick={openNotifications}
            aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
            className="sf-row sf-row--btn"
          >
            <Bell size={14} strokeWidth={1.75} className="sf-row__icon" />
            <span className="sf-row__label">Notifications</span>
            {unread > 0 && <span className="sf-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>

          {/* Runtime status */}
          <div className="sf-row">
            <span className={`status-dot ${risk.dot}`} style={{ flexShrink: 0 }} />
            <span className="sf-row__label">{risk.label}</span>
            <span className={`sf-status-pill ${status?.runtimeOnline === false ? 'sf-status-pill--off' : 'sf-status-pill--on'}`}>
              {status?.runtimeOnline === false ? 'offline' : 'active'}
            </span>
          </div>

          {/* Account identity — AWS/GCP style: no avatar, plain text rows */}
          {isSupabaseConfigured && user && (
            <div className="sf-account">
              <div className="sf-account__email" title={user.email ?? ''}>{user.email}</div>
              <button
                type="button"
                className="sf-row sf-row--btn sf-row--signout"
                onClick={() => signOut()}
              >
                <LogOut size={13} strokeWidth={1.75} className="sf-row__icon" />
                <span className="sf-row__label">Sign out</span>
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

            {/* Overflow pages — the items that don't fit in the bottom tab bar */}
            {overflowItems.length > 0 && (
              <div className="more-panel__section">
                {overflowItems.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`more-panel__row ${page === id ? 'more-panel__row--active' : ''}`}
                    onClick={() => { setMoreOpen(false); onPage(id) }}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}

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
