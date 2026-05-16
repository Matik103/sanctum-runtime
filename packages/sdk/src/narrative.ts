import type { ActionResult, Decision } from './types.js'

/** Context fields rendered in the narrative body, not as duplicate table rows. */
export const NARRATIVE_CONTEXT_KEYS = new Set([
  'heard',
  'trigger_phrase',
  'spoken_command',
  'user_said',
  'instruction',
  'prompt',
  'intent',
  'stated_intent',
  'goal',
  'reason',
  'channel',
  'source',
  'injection_phrase',
  'recentActions',
])

type NarrativeInput = Pick<
  ActionResult,
  'actor' | 'action' | 'context' | 'decision' | 'anomalyFlags' | 'reasoning'
>

function actorDisplay(actor: string): string {
  return actor
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function actionDisplay(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .toUpperCase()
}

function quote(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return t.length > 280 ? `"${t.slice(0, 277)}…"` : `"${t}"`
}

function str(ctx: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = ctx[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

/** Words/phrases the agent heard or was instructed with (voice, chat, injection). */
export function extractHeardPhrase(ctx: Record<string, unknown>): string {
  return str(
    ctx,
    'heard',
    'trigger_phrase',
    'spoken_command',
    'user_said',
    'injection_phrase',
    'instruction',
    'prompt',
    'command',
  )
}

export function extractIntent(ctx: Record<string, unknown>): string {
  return str(ctx, 'intent', 'stated_intent', 'goal', 'reason')
}

export function extractChannel(ctx: Record<string, unknown>): string {
  const ch = str(ctx, 'channel', 'source')
  if (!ch) return ''
  return ch.charAt(0).toUpperCase() + ch.slice(1)
}

function decisionPhrase(decision: Decision): string {
  switch (decision) {
    case 'APPROVED':
      return 'Approved — action may proceed'
    case 'BLOCKED':
      return 'Blocked — action must not execute'
    case 'REQUIRE_VERIFICATION':
      return 'Held for human verification before execution'
  }
}

function anomalyPhrase(flags: string[]): string {
  if (!flags.length) return ''
  const parts: string[] = []
  if (flags.includes('unusual_time_access')) parts.push('unusual time of day')
  if (flags.includes('owner_absent_or_sleeping')) parts.push('owner asleep or absent')
  if (flags.includes('suspicious_prompt_pattern')) parts.push('suspicious prompt / injection language')
  if (flags.includes('unsafe_command_chain')) parts.push('unsafe command escalation')
  if (flags.includes('high_value_transfer')) parts.push('high-value transfer')
  const extra = flags.filter(
    (f) =>
      ![
        'unusual_time_access',
        'owner_absent_or_sleeping',
        'suspicious_prompt_pattern',
        'unsafe_command_chain',
        'high_value_transfer',
      ].includes(f),
  )
  for (const f of extra) {
    parts.push(f.replace(/_/g, ' '))
  }
  return parts.length ? ` Flags: ${parts.join('; ')}.` : ''
}

function sceneDetails(ctx: Record<string, unknown>, action: string): string[] {
  const lines: string[] = []
  const time = str(ctx, 'time', 'timestamp')
  const location = str(ctx, 'location', 'zone', 'path')
  const channel = extractChannel(ctx)

  if (time) lines.push(`Time: ${time}.`)
  if (location) lines.push(`Location: ${location}.`)
  if (channel) lines.push(`Channel: ${channel}.`)

  if (action === 'send_email') {
    const to = str(ctx, 'to')
    const subject = str(ctx, 'subject')
    if (to) lines.push(`Recipient: ${to}.`)
    if (subject) lines.push(`Subject: ${subject}.`)
  }

  if (action === 'transfer_funds') {
    const amount = ctx.amount
    const currency = str(ctx, 'currency') || 'USD'
    const to = str(ctx, 'to')
    if (amount != null) lines.push(`Amount: ${amount} ${currency}.`)
    if (to) lines.push(`Destination: ${to}.`)
  }

  if (ctx.owner_sleeping === true || ctx.ownerPresent === false) {
    lines.push('Owner state: sleeping or not present.')
  }

  return lines
}

/**
 * Humans-style audit record: plain-language account of what was said, intended, and decided.
 */
export function buildHumanAuditRecord(input: NarrativeInput): string {
  const { actor, action, context: ctx, decision, anomalyFlags, reasoning } = input
  const who = actorDisplay(actor)
  const heard = extractHeardPhrase(ctx)
  const intent = extractIntent(ctx)
  const actionUpper = actionDisplay(action)

  const paragraphs: string[] = []

  paragraphs.push(`RECORD — ${actionDisplay(action)}`)

  const opener: string[] = []
  if (heard) {
    const channel = extractChannel(ctx)
    const via = channel ? ` via ${channel.toLowerCase()}` : ''
    opener.push(`${who} received${via}: ${quote(heard)}`)
  } else {
    opener.push(`${who} requested to ${actionDisplay(action).toLowerCase()}.`)
  }
  paragraphs.push(opener.join(' '))

  const attempt: string[] = []
  attempt.push(`The agent attempted ${actionUpper}.`)
  const scene = sceneDetails(ctx, action)
  if (scene.length) attempt.push(scene.join(' '))
  if (intent) attempt.push(`Stated intent: ${intent}.`)
  paragraphs.push(attempt.join(' '))

  const outcome = `${decisionPhrase(decision)}.${anomalyPhrase(anomalyFlags)}`
  const rationale =
    reasoning.length > 220 ? `${reasoning.slice(0, 217)}…` : reasoning
  paragraphs.push(`${outcome} ${rationale}`)

  return paragraphs.join('\n\n')
}

/** First line of the record — for compact tables. */
export function auditRecordHeadline(entry: NarrativeInput & { humanRecord?: string }): string {
  if (entry.humanRecord) {
    const first = entry.humanRecord.split('\n\n')[0]
    return first.replace(/^RECORD — /, '')
  }
  const heard = extractHeardPhrase(entry.context)
  const who = actorDisplay(entry.actor)
  if (heard) {
    const short = heard.length > 72 ? `${heard.slice(0, 69)}…` : heard
    return `${who} heard: "${short}"`
  }
  return `${who} — ${actionDisplay(entry.action).toLowerCase()}`
}

/** Full narrative for drawer / export (uses stored field when present). */
export function auditRecordText(entry: ActionResult): string {
  return entry.humanRecord ?? buildHumanAuditRecord(entry)
}
