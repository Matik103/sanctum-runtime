import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { auditRecordHeadline, auditRecordText } from '../lib/narrative'

type Props = {
  entry: ActionResult
  compact?: boolean
}

/** Humans-style readable audit entry. */
export function AuditRecord({ entry, compact }: Props) {
  const full = auditRecordText(entry)
  const headline = auditRecordHeadline(entry)

  if (compact) {
    return (
      <div className="audit-record audit-record--compact">
        <strong>{headline}</strong>
        <span className="audit-record__preview">
          {full.split('\n\n').slice(1, 2).join(' ').slice(0, 140)}
          {full.length > 140 ? '…' : ''}
        </span>
      </div>
    )
  }

  return (
    <article className="audit-record">
      {full.split('\n\n').map((block, i) => (
        <p key={i} className={i === 0 ? 'audit-record__title' : undefined}>
          {block}
        </p>
      ))}
    </article>
  )
}
