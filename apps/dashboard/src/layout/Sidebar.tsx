import {
  Activity,
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
  | 'policies'
  | 'devices'
  | 'fleet'
  | 'marketplace'
  | 'audit'
  | 'settings'

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Runtime Activity', icon: Activity },
  { id: 'threats', label: 'Threat Monitor', icon: ShieldAlert },
  { id: 'policies', label: 'Policies', icon: Shield },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'fleet', label: 'Fleet', icon: Radio },
  { id: 'marketplace', label: 'Marketplace', icon: Package },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type Props = {
  page: PageId
  onPage: (p: PageId) => void
  status: RuntimeStatus | null
}

export function Sidebar({ page, onPage, status }: Props) {
  const { user, signOut } = useAuth()
  const risk = riskModelStatusLine(status)

  return (
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
      </nav>

      <div className="sidebar-footer">
        <div style={{ marginBottom: '0.5rem' }}>
          <span className={`status-dot ${risk.dot}`} />
          {risk.label}
        </div>
        <div>
          Runtime <strong style={{ color: 'var(--success)' }}>active</strong>
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
