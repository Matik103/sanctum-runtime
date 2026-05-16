import type { Decision } from '@sanctum-runtime/sdk'

/** unlock_door → Unlock door */
export function actionLabel(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** policy.unlock_door → Unlock door policy */
export function policyLabel(policyPath: string): string {
  const action = policyPath.replace(/^policy\./, '')
  return `${actionLabel(action)} policy`
}

export function decisionLabel(decision: Decision): string {
  switch (decision) {
    case 'APPROVED':
      return 'Approved'
    case 'BLOCKED':
      return 'Blocked'
    case 'REQUIRE_VERIFICATION':
      return 'Verification required'
  }
}

export function riskLabel(risk: string): string {
  return risk.charAt(0).toUpperCase() + risk.slice(1)
}

/** developer-test → Developer test */
export function actorLabel(actor: string): string {
  return actor
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const CONTEXT_KEYS: Record<string, string> = {
  time: 'Time',
  location: 'Location',
  owner_sleeping: 'Owner sleeping',
  to: 'Recipient',
  amount: 'Amount',
  description: 'Description',
}

const ANOMALY_LABELS: Record<string, string> = {
  unusual_time_access: 'Unusual time',
  owner_absent_or_sleeping: 'Owner vulnerable',
  suspicious_prompt_pattern: 'Prompt injection',
  unsafe_command_chain: 'Unsafe escalation',
  high_value_transfer: 'High-value transfer',
}

export function contextFieldLabel(key: string): string {
  return CONTEXT_KEYS[key] ?? humanizeToken(key)
}

export function anomalyLabel(flag: string): string {
  return ANOMALY_LABELS[flag] ?? humanizeToken(flag)
}

function humanizeToken(token: string): string {
  return token
    .split(/[._-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function formatContextValue(_key: string, value: unknown): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export type ContextRow = { label: string; value: string }

export function contextRows(context: Record<string, unknown>): ContextRow[] {
  return Object.entries(context).map(([key, value]) => ({
    label: contextFieldLabel(key),
    value: formatContextValue(key, value),
  }))
}
