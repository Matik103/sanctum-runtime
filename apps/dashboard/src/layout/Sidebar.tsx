import {
  Activity,
  LayoutDashboard,
  Monitor,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
} from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk'

export type PageId =
  | 'overview'
  | 'activity'
  | 'threats'
  | 'policies'
  | 'devices'
  | 'audit'
  | 'settings'

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Runtime Activity', icon: Activity },
  { id: 'threats', label: 'Threat Monitor', icon: ShieldAlert },
  { id: 'policies', label: 'Policies', icon: Shield },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

type Props = {
  page: PageId
  onPage: (p: PageId) => void
  status: RuntimeStatus | null
}

export function Sidebar({ page, onPage, status }: Props) {
  const ollamaOk = status?.ollamaConnected ?? false
  const offline = status?.systemOfflineCapable ?? false

  return (
    <aside className="sidebar">
      <div className="brand-block">
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
            <Icon size={17} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ marginBottom: '0.5rem' }}>
          <span className={`status-dot ${ollamaOk ? 'ok' : 'warn'}`} />
          {ollamaOk ? 'Ollama connected' : 'Ollama offline'}
        </div>
        <div>
          Local runtime <strong style={{ color: 'var(--success)' }}>active</strong>
        </div>
        {offline && (
          <div style={{ marginTop: '0.35rem', color: 'var(--warning)' }}>
            Heuristic fallback ready
          </div>
        )}
      </div>
    </aside>
  )
}
