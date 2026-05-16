import { actionLabel } from '../lib/labels'

type Props = {
  count: number
  summary: string
  onReviewNext: () => void
  onDismissAll: () => void
  onViewActivity: () => void
}

export function ReviewQueueBanner({
  count,
  summary,
  onReviewNext,
  onDismissAll,
  onViewActivity,
}: Props) {
  return (
    <div
      className="card"
      style={{
        marginBottom: '1rem',
        borderColor: 'var(--warning)',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
        <strong>{count}</strong> past event{count === 1 ? '' : 's'} in the audit log are marked{' '}
        <strong>verification required</strong>. The dashboard reviews them{' '}
        <strong>one at a time</strong> — not all at once. {summary}
      </p>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
        These are audit log entries awaiting your decision — not simultaneous live incidents.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={onReviewNext}>
          Review next
        </button>
        <button type="button" className="btn btn-ghost" onClick={onViewActivity}>
          View all in activity
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismissAll}>
          Dismiss all from queue
        </button>
      </div>
    </div>
  )
}

export function summarizePendingActions(actions: string[]): string {
  const counts = new Map<string, number>()
  for (const a of actions) {
    counts.set(a, (counts.get(a) ?? 0) + 1)
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, n]) => `${n}× ${actionLabel(action)}`)
  return parts.length ? `Includes ${parts.join(', ')}.` : ''
}
