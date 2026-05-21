import type { ActionRequest } from '@sanctum-runtime/sdk'

/** Custom anomaly rule — return flag strings to add, or empty array if no anomaly. */
export type AnomalyRule = (request: ActionRequest) => string[]

const customRules: AnomalyRule[] = []

/**
 * Register a custom anomaly detection rule. Rules are called on every action
 * alongside built-in detection. Call this at startup before serving requests.
 */
export function registerAnomalyRule(rule: AnomalyRule): void {
  customRules.push(rule)
}

// Actions considered sensitive for off-hours access (checked in UTC)
const OFF_HOURS_SENSITIVE = new Set([
  'unlock_door',
  'disable_alarm',
  'access_database',
  'create_user',
  'delete_file',
  'execute_terminal',
  'transfer_funds',
])

// Known privilege-escalation sequences
const ESCALATION_SEQUENCES: string[][] = [
  ['create_user', 'transfer_funds'],
  ['access_database', 'delete_file'],
  ['execute_terminal', 'create_user'],
  ['disable_alarm', 'unlock_door'],
]

// Prompt injection / jailbreak signal patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /\bjailbreak\b/i,
  /\bbypass\s+(all\s+)?(safety|filter|restriction|rule)/i,
  /\bdo\s+anything\s+now\b/i,
  /\bDAN\b/,
  /\bdisregard\s+(all\s+)?prior/i,
  /\bact\s+as\s+(if\s+you\s+(have\s+no|are\s+not)|an?\s+unrestricted)/i,
  /\bforget\s+(all\s+)?previous\s+(prompt|instruction|context)/i,
  /\bsystem\s+prompt\s*:/i,
  /\[\s*system\s*\]/i,
]

export function detectAnomalies(request: ActionRequest): string[] {
  const flags: string[] = []
  const ctx = request.context

  // --- Off-hours access for sensitive actions (UTC hour) ---
  if (OFF_HOURS_SENSITIVE.has(request.action)) {
    const utcHour = new Date().getUTCHours()
    const timeStr = String(ctx.time ?? ctx.timestamp ?? '')
    const parsedHour = parseHour(timeStr)
    const hour = parsedHour ?? utcHour
    // Flag 0–5 UTC as off-hours (same threshold, but timezone-consistent)
    if (hour >= 0 && hour < 6) {
      flags.push('unusual_time_access')
    }
  }

  // --- Smart-home / physical security context ---
  if (request.action === 'unlock_door' || request.action === 'disable_alarm') {
    if (ctx.ownerPresent === false || ctx.owner_sleeping === true) {
      flags.push('owner_absent_or_sleeping')
    }
  }

  // --- High-value financial transfer ---
  if (request.action === 'transfer_funds') {
    const amount = Number(ctx.amount ?? 0)
    if (amount > 1000) flags.push('high_value_transfer')
  }

  // --- Prompt injection / jailbreak patterns ---
  const prompt = String(ctx.prompt ?? ctx.instruction ?? ctx.message ?? ctx.input ?? '')
  if (prompt && INJECTION_PATTERNS.some((p) => p.test(prompt))) {
    flags.push('suspicious_prompt_pattern')
  }

  // --- Rapid-repeat: same action requested ≥3 times in recent chain ---
  const chain = ctx.recentActions
  if (Array.isArray(chain)) {
    if (chain.length >= 4) flags.push('unsafe_command_chain')
    const recent = chain.slice(-5)
    const sameAction = recent.filter(
      (a) => typeof a === 'string' && a === request.action,
    ).length
    if (sameAction >= 3) flags.push('rapid_repeat_action')
  }

  // --- Privilege-escalation sequence detection ---
  if (Array.isArray(chain) && chain.length >= 2) {
    const recentStr = chain.slice(-5).filter((a) => typeof a === 'string') as string[]
    const withCurrent = [...recentStr, request.action]
    for (const seq of ESCALATION_SEQUENCES) {
      if (seq.every((step) => withCurrent.includes(step))) {
        flags.push('privilege_escalation_chain')
        break
      }
    }
  }

  for (const rule of customRules) {
    const extra = rule(request)
    for (const flag of extra) {
      if (!flags.includes(flag)) flags.push(flag)
    }
  }

  return flags
}

function parseHour(time: string): number | null {
  const match = time.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1])
}
