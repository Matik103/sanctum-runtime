import type { ActionRequest, BlastRadius, SourceTrust } from '@sanctum-runtime/sdk'

const KNOWN_TRUSTS = new Set<SourceTrust>([
  'trusted_user',
  'authenticated_user',
  'system',
  'tool_output',
  'memory',
  'untrusted_content',
  'unknown',
])

/**
 * Classify the trust level of an action's instruction source.
 * Honors explicit `context.instructionSource` if set, then falls back to heuristics.
 *
 * The trust level feeds policies that protect against indirect prompt injection:
 * untrusted content (web pages, emails, tool output) should not be able to drive
 * high-blast-radius actions even if the model is willing.
 */
export function deriveSourceTrust(request: ActionRequest): SourceTrust {
  const ctx = request.context as Record<string, unknown>
  const raw = typeof ctx?.instructionSource === 'string' ? ctx.instructionSource.toLowerCase() : ''
  if (KNOWN_TRUSTS.has(raw as SourceTrust)) return raw as SourceTrust
  // Common aliases the SDK may emit
  if (raw === 'user' || raw === 'human') return 'trusted_user'
  if (raw === 'webpage' || raw === 'email' || raw === 'document' || raw === 'web') return 'untrusted_content'
  if (raw === 'tool' || raw === 'function_result') return 'tool_output'
  if (raw === 'memory_recall' || raw === 'rag') return 'memory'
  // Authenticated user when actor pattern looks like an authenticated session
  if (typeof request.actor === 'string' && /^user:|@/.test(request.actor)) return 'authenticated_user'
  return 'unknown'
}

const HIGH_VALUE_ACTIONS = /(transfer|wire|pay|payment|invoice|trade|withdraw|refund|charge)/i
const PHYSICAL_ACTIONS = /(move_robot|actuate|locomot|unlock|navigate|manipulator|drive|fly|fire|launch|robot)/i
const IRREVERSIBLE_ACTIONS = /(delete|drop|wipe|format|erase|destroy|terminate|revoke|expire|cancel)/i
const EXTERNAL_ACTIONS = /(send_email|post|publish|webhook|tweet|message|notify|sms)/i
const CRED_ACTIONS = /(credential|secret|password|key|token|api_key|keychain)/i
const PHI_ACTIONS = /(patient|phi|medical|health|diagnosis|record)/i
const PII_ACTIONS = /(ssn|social_security|passport|dob|address|email|phone)/i

/**
 * Estimate the "blast radius" of an action — what is affected if it runs,
 * and how recoverable the system is if the decision is wrong.
 *
 * Score in [0, 100]. Critical = ≥80, High = ≥60, Medium = ≥35, Low otherwise.
 */
export function estimateBlastRadius(request: ActionRequest): BlastRadius {
  const action = request.action ?? ''
  const ctx = (request.context ?? {}) as Record<string, unknown>
  const factors: string[] = []
  let score = 10
  let reversible = true
  let externalDestination = false
  let physicalWorld = false
  let dataSensitivity: BlastRadius['dataSensitivity'] = 'public'
  let estimatedValue: number | undefined

  if (HIGH_VALUE_ACTIONS.test(action)) {
    score += 30
    factors.push('monetary impact')
    const amt = Number(ctx.amount ?? ctx.value ?? ctx.total)
    if (Number.isFinite(amt) && amt > 0) {
      estimatedValue = amt
      if (amt > 10_000) { score += 15; factors.push(`$${amt.toLocaleString()} at risk`) }
      else if (amt > 1_000) { score += 8 }
    }
  }
  if (PHYSICAL_ACTIONS.test(action) || ctx.physicalWorld === true) {
    score += 30
    physicalWorld = true
    factors.push('physical-world effect')
  }
  if (IRREVERSIBLE_ACTIONS.test(action) || ctx.reversible === false) {
    score += 20
    reversible = false
    factors.push('irreversible')
  }
  if (EXTERNAL_ACTIONS.test(action) || typeof ctx.destination === 'string') {
    score += 10
    externalDestination = true
    factors.push('external destination')
  }
  if (CRED_ACTIONS.test(action)) {
    score += 25
    dataSensitivity = 'secret'
    factors.push('credentials / secrets')
  } else if (PHI_ACTIONS.test(action)) {
    score += 20
    dataSensitivity = 'regulated'
    factors.push('PHI / regulated data')
  } else if (PII_ACTIONS.test(action)) {
    score += 12
    dataSensitivity = 'confidential'
    factors.push('PII')
  }
  // Explicit override in context
  const ctxSens = typeof ctx.dataSensitivity === 'string' ? ctx.dataSensitivity : null
  if (ctxSens === 'public' || ctxSens === 'internal' || ctxSens === 'confidential' || ctxSens === 'secret' || ctxSens === 'regulated') {
    dataSensitivity = ctxSens
  }
  // Untrusted source → bump
  const trust = deriveSourceTrust(request)
  if (trust === 'untrusted_content') { score += 15; factors.push('instruction from untrusted source') }
  else if (trust === 'tool_output') { score += 8; factors.push('instruction from tool output') }

  score = Math.max(0, Math.min(100, score))
  const level: BlastRadius['level'] =
    score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low'

  return {
    level,
    score,
    factors,
    reversible,
    dataSensitivity,
    externalDestination,
    physicalWorld,
    estimatedValue,
  }
}
