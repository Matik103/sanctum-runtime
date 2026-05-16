import type { ActionResult } from '@sanctum-runtime/sdk/browser'

/** Last N hourly buckets of audit volume for the overview spark chart. */
export function sparkBars(audit: ActionResult[], bars = 7): number[] {
  const hourMs = 3_600_000
  const now = Date.now()
  const counts = Array.from({ length: bars }, (_, i) => {
    const start = now - (bars - i) * hourMs
    const end = start + hourMs
    return audit.filter((e) => {
      const t = new Date(e.timestamp).getTime()
      return t >= start && t < end
    }).length
  })
  const max = Math.max(1, ...counts)
  return counts.map((c) => Math.max(1, Math.round((c / max) * 10)))
}
