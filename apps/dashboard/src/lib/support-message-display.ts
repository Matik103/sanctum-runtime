/** Inbox transcript normalization — keep in sync with apps/api/src/support-message-display.ts */

import type { InboxMessage } from './support-inbox-api'

const LEGACY_QUEUE_MARKERS = ['in the queue', 'sanctum teammate will join']
const HANDOFF_CONFIRMATION_MARKERS = ['specialist is reviewing', "you're with our team now"]

function isNearDuplicate(a: InboxMessage, b: InboxMessage): boolean {
  if (a.role !== b.role) return false
  if (a.content.trim() !== b.content.trim()) return false
  const senderA = a.sender ?? (a.role === 'user' ? 'user' : 'bot')
  const senderB = b.sender ?? (b.role === 'user' ? 'user' : 'bot')
  if (senderA !== senderB) return false
  const ta = Date.parse(a.created_at)
  const tb = Date.parse(b.created_at)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true
  return Math.abs(tb - ta) < 120_000
}

export function normalizeInboxMessages(messages: InboxMessage[]): InboxMessage[] {
  const byId: InboxMessage[] = []
  const seenIds = new Set<string>()
  for (const m of messages) {
    if (seenIds.has(m.id)) continue
    seenIds.add(m.id)
    byId.push(m)
  }

  const hasModernHandoff = byId.some((m) => {
    const c = m.content.toLowerCase()
    return HANDOFF_CONFIRMATION_MARKERS.some((marker) => c.includes(marker))
  })

  const joinedKeys = new Set<string>()
  const filtered = byId.filter((m) => {
    const lower = m.content.toLowerCase()
    if (
      hasModernHandoff &&
      m.sender === 'system' &&
      LEGACY_QUEUE_MARKERS.some((marker) => lower.includes(marker))
    ) {
      return false
    }
    if (m.sender === 'system' && lower.includes('joined the conversation')) {
      const key = m.content.trim().toLowerCase()
      if (joinedKeys.has(key)) return false
      joinedKeys.add(key)
    }
    return true
  })

  const out: InboxMessage[] = []
  for (const m of filtered) {
    const prev = out[out.length - 1]
    if (prev && isNearDuplicate(prev, m)) continue
    out.push(m)
  }

  return out
}
