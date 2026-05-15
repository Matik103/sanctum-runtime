import type { ActionRequest } from '@sanctum/sdk'

export function detectAnomalies(request: ActionRequest): string[] {
  const flags: string[] = []
  const ctx = request.context
  const time = String(ctx.time ?? ctx.timestamp ?? '')

  if (request.action === 'unlock_door') {
    const hour = parseHour(time)
    if (hour !== null && (hour >= 0 && hour < 6)) {
      flags.push('unusual_time_access')
    }
    if (ctx.ownerPresent === false || ctx.owner_sleeping === true) {
      flags.push('owner_absent_or_sleeping')
    }
  }

  if (request.action === 'transfer_funds') {
    const amount = Number(ctx.amount ?? 0)
    if (amount > 1000) {
      flags.push('high_value_transfer')
    }
  }

  const prompt = String(ctx.prompt ?? ctx.instruction ?? '')
  if (/ignore (all|previous) instructions|jailbreak|bypass/i.test(prompt)) {
    flags.push('suspicious_prompt_pattern')
  }

  const chain = ctx.recentActions
  if (Array.isArray(chain) && chain.length >= 4) {
    flags.push('unsafe_command_chain')
  }

  return flags
}

function parseHour(time: string): number | null {
  const match = time.match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Number(match[1])
}
