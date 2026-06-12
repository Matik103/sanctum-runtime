import { Bot, Monitor, Plug } from 'lucide-react'
import type { PageId } from '../layout/Sidebar'

type Props = { onPage?: (p: PageId) => void; compact?: boolean }

/** Clarifies the three agent integration paths in one place. */
export function AgentPathsExplainer({ onPage, compact }: Props) {
  const paths = [
    {
      icon: Bot,
      title: 'Registered agents',
      desc: 'HTTP verify with signed tokens — use from any language or cloud.',
      page: 'agents' as PageId,
      cta: 'Agents',
    },
    {
      icon: Plug,
      title: 'Connect proxy',
      desc: 'Gate OpenAI-compatible tool calls through Sanctum without rewriting your agent.',
      page: 'connect' as PageId,
      cta: 'Connect',
    },
    {
      icon: Monitor,
      title: 'SDK runtimes',
      desc: 'Long-lived processes on your infra — fleet map, attestation, dispatch.',
      page: 'devices' as PageId,
      cta: 'Devices',
    },
  ]

  return (
    <section className={`card agent-paths${compact ? ' agent-paths--compact' : ''}`} style={{ padding: compact ? '0.85rem 1rem' : '1rem 1.15rem', marginBottom: '1rem' }}>
      {!compact && (
        <h2 className="card-title" style={{ marginBottom: '0.35rem', fontSize: '0.95rem' }}>Three ways to connect agents</h2>
      )}
      <div className="agent-paths__grid">
        {paths.map(({ icon: Icon, title, desc, page, cta }) => (
          <div key={page} className="agent-paths__item">
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            <div>
              <strong style={{ fontSize: '0.84rem' }}>{title}</strong>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', opacity: 0.72, lineHeight: 1.4 }}>{desc}</p>
              {onPage && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.35rem', padding: '0 0.35rem' }} onClick={() => onPage(page)}>
                  Open {cta} →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
