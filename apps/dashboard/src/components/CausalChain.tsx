import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { actionLabel, decisionLabel } from '../lib/labels'
import { decisionTone, timeAgo } from '../lib/format'

type Props = {
  /** The audit entry we're investigating. */
  entry: ActionResult
  /** Full audit list — used to walk parent / child links. */
  audit: ActionResult[]
  onSelect?: (e: ActionResult) => void
}

/**
 * Reconstruct the causal chain for an audit entry by walking:
 *   - parentAuditId backwards to the root cause
 *   - all entries whose parentAuditId points back to anyone in the chain
 *
 * Also groups by correlationId as a fallback when parentAuditId isn't set
 * (older entries) so multi-step actions in the same correlation thread are
 * still visualized together.
 */
function buildChain(entry: ActionResult, audit: ActionResult[]): ActionResult[] {
  const byId = new Map(audit.map((e) => [e.id, e]))

  // Walk backwards via parentAuditId
  const ancestors: ActionResult[] = []
  let cursor: ActionResult | undefined = entry
  const seen = new Set<string>()
  while (cursor?.parentAuditId && !seen.has(cursor.parentAuditId)) {
    seen.add(cursor.parentAuditId)
    const parent = byId.get(cursor.parentAuditId)
    if (!parent) break
    ancestors.unshift(parent)
    cursor = parent
  }

  // Walk forwards: any entries whose parentAuditId is in our chain.
  const chainIds = new Set([...ancestors.map((a) => a.id), entry.id])
  const descendants: ActionResult[] = []
  let added = true
  while (added) {
    added = false
    for (const e of audit) {
      if (chainIds.has(e.id)) continue
      if (e.parentAuditId && chainIds.has(e.parentAuditId)) {
        descendants.push(e)
        chainIds.add(e.id)
        added = true
      }
    }
  }

  // Fallback: same correlationId entries that aren't already linked
  const correlated = audit.filter(
    (e) => e.correlationId === entry.correlationId && !chainIds.has(e.id),
  )

  return [...ancestors, entry, ...descendants, ...correlated].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )
}

export function CausalChain({ entry, audit, onSelect }: Props) {
  const chain = buildChain(entry, audit)
  if (chain.length <= 1) {
    return (
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
        Standalone action — no upstream or downstream actions linked via
        <code style={{ margin: '0 0.25rem' }}>parentAuditId</code> or
        <code style={{ margin: '0 0.25rem' }}>correlationId</code>.
      </p>
    )
  }
  return (
    <ol className="causal-chain" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {chain.map((node, idx) => {
        const isFocus = node.id === entry.id
        const tone = decisionTone(node.decision)
        return (
          <li
            key={node.id}
            style={{
              position: 'relative',
              paddingLeft: '1.4rem',
              paddingBottom: idx === chain.length - 1 ? 0 : '0.85rem',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '0.5rem',
                top: '0.35rem',
                width: 8,
                height: 8,
                borderRadius: 4,
                background: isFocus ? 'var(--accent)' : 'var(--muted)',
                boxShadow: isFocus ? '0 0 0 3px rgba(79,124,255,0.25)' : 'none',
              }}
            />
            {idx < chain.length - 1 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '1rem',
                  bottom: 0,
                  width: 1,
                  background: 'var(--border)',
                }}
              />
            )}
            <button
              type="button"
              onClick={() => onSelect?.(node)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                color: 'inherit',
                textAlign: 'left',
                cursor: onSelect ? 'pointer' : 'default',
                fontWeight: isFocus ? 600 : 400,
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                <span className={`badge ${tone}`} style={{ fontSize: '0.68rem' }}>
                  {decisionLabel(node.decision)}
                </span>
                <span>{actionLabel(node.action)}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>by {node.actor}</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                {timeAgo(node.timestamp)}
                {node.parentAuditId && (
                  <span style={{ marginLeft: '0.4rem' }}>· parent: {node.parentAuditId.slice(0, 8)}</span>
                )}
                {node.blastRadius && (
                  <span style={{ marginLeft: '0.4rem' }}>· blast {node.blastRadius.level}</span>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
