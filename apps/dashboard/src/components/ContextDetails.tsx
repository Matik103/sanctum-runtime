import { actorLabel, contextRows } from '../lib/labels'

type Props = {
  context: Record<string, unknown>
  actor: string
}

/** Human-readable action context (no raw JSON). */
export function ContextDetails({ context, actor }: Props) {
  const rows = contextRows(context)

  return (
    <dl className="detail-list">
      <div>
        <dt>Requested by</dt>
        <dd>{actorLabel(actor)}</dd>
      </div>
      {rows.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
