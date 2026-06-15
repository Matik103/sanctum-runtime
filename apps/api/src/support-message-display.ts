/** Normalize support transcript for display — dedupe and drop superseded system notices. */

export type NormalizableMessage = {
  id: string
  role: string
  content: string
  sender?: string | null
  created_at: string
}

const LEGACY_QUEUE_MARKERS = ['in the queue', 'sanctum teammate will join']
const HANDOFF_CONFIRMATION_MARKERS = ['specialist is reviewing', 'you\'re with our team now']

export function dedupeSupportMessages<T extends NormalizableMessage>(messages: T[]): T[] {
  const byId: T[] = []
  const seenIds = new Set<string>()

  for (const m of messages) {
    if (seenIds.has(m.id)) continue
    seenIds.add(m.id)
    byId.push(m)
  }

  const out: T[] = []
  for (const m of byId) {
    const prev = out[out.length - 1]
    if (prev && isNearDuplicate(prev, m)) continue
    out.push(m)
  }

  return out
}

function isNearDuplicate(a: NormalizableMessage, b: NormalizableMessage): boolean {
  if (a.role !== b.role) return false
  if (a.content.trim() !== b.content.trim()) return false
  const senderA = a.sender ?? (a.role === 'user' ? 'user' : 'assistant')
  const senderB = b.sender ?? (b.role === 'user' ? 'user' : 'assistant')
  if (senderA !== senderB) return false
  const ta = Date.parse(a.created_at)
  const tb = Date.parse(b.created_at)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true
  return Math.abs(tb - ta) < 120_000
}

export function filterStaleSystemMessages<T extends NormalizableMessage>(messages: T[]): T[] {
  const hasModernHandoff = messages.some((m) => {
    const c = m.content.toLowerCase()
    return HANDOFF_CONFIRMATION_MARKERS.some((marker) => c.includes(marker))
  })

  const joinedOperators = new Set<string>()

  return messages.filter((m) => {
    const sender = m.sender ?? null
    const content = m.content
    const lower = content.toLowerCase()

    if (hasModernHandoff && sender === 'system' && LEGACY_QUEUE_MARKERS.some((marker) => lower.includes(marker))) {
      return false
    }

    if (sender === 'system' && lower.includes('joined the conversation')) {
      const key = content.trim().toLowerCase()
      if (joinedOperators.has(key)) return false
      joinedOperators.add(key)
    }

    return true
  })
}

export function normalizeSupportTranscript<T extends NormalizableMessage>(messages: T[]): T[] {
  return dedupeSupportMessages(filterStaleSystemMessages(messages))
}
