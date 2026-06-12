/**
 * Behavioral trust / health scores derived from real audit decisions.
 * Used by the API (agent stats) and dashboard (org + agent badges).
 *
 * Not the same as runtime attestation trust_score (see control-plane attestation).
 */

export type TrustScoreInput = {
  decision: string
  anomalyFlags?: string[] | null
  shield?: { level?: string; score?: number | null } | null
  shield_level?: string | null
  shield_score?: number | null
  timestamp?: string
}

const MS_24H = 86_400_000

function normalizeEntry(entry: TrustScoreInput) {
  return {
    decision: entry.decision,
    flags: entry.anomalyFlags ?? [],
    shieldScore: entry.shield?.score ?? entry.shield_score ?? null,
  }
}

function filterWindow(entries: TrustScoreInput[], windowMs: number, now: number) {
  return entries.filter((e) => {
    if (!e.timestamp) return true
    const t = new Date(e.timestamp).getTime()
    return Number.isFinite(t) && now - t <= windowMs
  })
}

/**
 * Composite behavioral health (0–100) from audit outcomes in a time window.
 * Returns null when there is no activity — callers should show "No data", not a fake score.
 */
export function computeBehavioralTrustScore(
  entries: TrustScoreInput[],
  opts: { windowMs?: number; now?: number } = {},
): number | null {
  const windowMs = opts.windowMs ?? MS_24H
  const now = opts.now ?? Date.now()
  const windowed = filterWindow(entries, windowMs, now)
  if (windowed.length === 0) return null

  const n = windowed.length
  let approved = 0
  let held = 0
  let blocked = 0
  let flaggedApproved = 0
  const shieldScores: number[] = []

  for (const raw of windowed) {
    const e = normalizeEntry(raw)
    if (e.decision === 'APPROVED') {
      approved++
      if (e.flags.length > 0) flaggedApproved++
    } else if (e.decision === 'REQUIRE_VERIFICATION') {
      held++
    } else if (e.decision === 'BLOCKED') {
      blocked++
    }
    if (e.shieldScore != null && e.shieldScore > 0) shieldScores.push(e.shieldScore)
  }

  // Held actions are workflow, not failures — count at 50% toward decision health.
  const decisionHealth = ((approved + held * 0.5) / n) * 100
  const blockRate = blocked / n
  const adjustedDecision = decisionHealth * (1 - blockRate * 0.85)

  const shieldHealth =
    shieldScores.length > 0
      ? 100 - shieldScores.reduce((sum, s) => sum + s, 0) / shieldScores.length
      : 100

  const anomalyHealth = 100 - (flaggedApproved / n) * 100

  const composite = 0.5 * adjustedDecision + 0.3 * shieldHealth + 0.2 * anomalyHealth
  return Math.round(Math.max(0, Math.min(100, composite)))
}

export function trustScoreTone(score: number | null): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 85) return 'ok'
  if (score >= 65) return 'warn'
  return 'danger'
}

export function formatAttestationTrustScore(score: number): string {
  const n = Math.round(Math.max(0, Math.min(100, score)))
  return `${n}%`
}
