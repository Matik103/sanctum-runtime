import { ArrowRight, Plug } from 'lucide-react'
import { Phase3Onboarding } from './Phase3Onboarding'
import type { PageId } from '../layout/Sidebar'

type Props = {
  eventCount: number
  orgId?: string | null
  onPage?: (p: PageId) => void
}

/** Shown on Overview until the org has meaningful audit activity. */
export function OverviewOnboarding({ eventCount, orgId, onPage }: Props) {
  if (eventCount >= 5 || !onPage) return null

  return (
    <section className="overview-onboarding" style={{ marginBottom: '1.25rem' }}>
      <Phase3Onboarding onPage={onPage} />
      <div
        className="card"
        style={{
          marginTop: '0.75rem',
          padding: '1rem 1.15rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <strong style={{ fontSize: '0.92rem' }}>First action gated in under 5 minutes</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '36rem' }}>
            Agents can reach email, code, files, and APIs. Connect routes every tool call through Sanctum before it executes.
            {orgId ? '' : ' Sign in with an organization to persist audit history.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPage('connect')}>
            <Plug size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Connect Agent
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('devices')}>
            Get API key
            <ArrowRight size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPage('live-feed')}>
            Open Live Feed
          </button>
        </div>
      </div>
    </section>
  )
}
