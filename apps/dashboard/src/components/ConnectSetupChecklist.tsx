import { canUseConnectGate, normalizePlanId, type PlanId } from '../lib/billing'
import type { ConnectHealth } from '../lib/connect-agent'

type Props = {
  planId: PlanId | string
  hasAgent: boolean
  hasPlatformKey: boolean
  verifyTestOk: boolean
  liveFeedEvents: number
}

export function ConnectSetupChecklist({
  planId,
  hasAgent,
  hasPlatformKey,
  verifyTestOk,
  liveFeedEvents,
}: Props) {
  const steps = [
    { id: 'agent', label: 'Register Sanctum agent', done: hasAgent },
    { id: 'key', label: 'Save platform API key', done: hasPlatformKey },
    { id: 'test', label: 'Run verify pipeline test', done: verifyTestOk },
    { id: 'feed', label: 'First tool call in Live Feed', done: liveFeedEvents > 0 },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const gateAllowed = canUseConnectGate(planId)

  return (
    <section className="card connect-checklist" style={{ padding: '1.1rem 1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 className="card-title" style={{ marginBottom: '0.35rem' }}>Connection checklist</h2>
          <p style={{ fontSize: '0.82rem', opacity: 0.72, margin: 0 }}>
            {doneCount}/{steps.length} complete — finish setup to gate production tool calls.
          </p>
        </div>
        <span
          className={`badge ${gateAllowed ? 'success' : 'neutral'}`}
          title={gateAllowed ? 'Gate mode available on your plan' : 'Developer plan uses observe-only until Personal+'}
        >
          {gateAllowed ? 'Gate mode unlocked' : 'Gate requires Personal+'}
        </span>
      </div>
      <ol className="connect-checklist__list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? 'connect-checklist__item connect-checklist__item--done' : 'connect-checklist__item'}>
            <span className="connect-checklist__mark" aria-hidden>{step.done ? '✓' : '○'}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      {!gateAllowed && (
        <p style={{ fontSize: '0.78rem', opacity: 0.72, margin: '0.75rem 0 0', lineHeight: 1.45 }}>
          Current plan: <strong>{normalizePlanId(planId)}</strong> (observe-only). Connect proxy traffic is audited in Live Feed;
          tool calls are <strong>not</strong> blocked or held until you upgrade to Personal+.
        </p>
      )}
    </section>
  )
}

export type { ConnectHealth }
