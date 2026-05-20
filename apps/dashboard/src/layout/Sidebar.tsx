import {
  Activity,
  Bell,
  Bot,
  CheckSquare,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Monitor,
  Package,
  Radio,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
} from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { useAuth } from '../auth/AuthProvider'
import { riskModelStatusLine } from '../lib/risk-label'
import { isSupabaseConfigured } from '../lib/supabase'

export type PageId =
  | 'overview'
  | 'activity'
  | 'threats'
  | 'alerts'
  | 'policies'
  | 'policy-history'
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
  'audit',
  'settings',
]

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard; group?: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Runtime Activity', icon: Activity },
  { id: 'threats', label: 'Threat Monitor', icon: ShieldAlert },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'policies', label: 'Policies', icon: Shield },
  { id: 'policy-history', label: 'Policy History', icon: History },
  { id: 'governance', label: 'Governance', icon: CheckSquare },
  { id: 'compliance', label: 'Compliance', icon: FileText },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'fleet', label: 'Runtime Fleet', icon: Radio },
  { id: 'marketplace', label: 'Marketplace', icon: Package },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type Props = {
  page: PageId
  onPage: (p: PageId) => void
  status: RuntimeStatus | null
  companionMode?: boolean
}

export function Sidebar({ page, onPage, status, companionMode }: Props) {
  const { user, signOut } = useAuth()
  const risk = riskModelStatusLine(status)
  const navItems = companionMode
    ? NAV.filter((n) => COMPANION_NAV_IDS.includes(n.id))
    : NAV

  return (
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
      </nav>

      <div className="sidebar-footer">
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
              style={{
                display: 'block',
                marginTop: '0.35rem',
                padding: '0.25rem 0',
                fontSize: '0.78rem',
              }}
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
