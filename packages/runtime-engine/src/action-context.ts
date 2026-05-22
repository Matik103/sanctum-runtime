import type { ActionRequest, BlastRadius, SourceTrust } from '@sanctum-runtime/sdk'

const PHYSICAL_ACTIONS = new Set([
  'unlock_door',
  'disable_alarm',
  'move_robot',
  'move_to_location',
  'navigate',
  'dock',
  'start_line',
  'emergency_stop',
  'setpoint_change',
])

const IRREVERSIBLE_ACTIONS = new Set([
  'delete_file',
  'delete_database',
  'execute_terminal',
  'transfer_funds',
  'send_email',
  'create_user',
  'install_package',
  'start_line',
])

export function deriveSourceTrust(request: ActionRequest): SourceTrust {
  const ctx = request.context as Record<string, unknown>
  const raw = String(
    ctx.instructionSource ??
      ctx.sourceTrust ??
      ctx.source ??
      ctx.origin ??
      '',
  ).toLowerCase()

  if (['trusted_user', 'trusted-user', 'operator', 'admin'].includes(raw)) return 'trusted_user'
  if (['authenticated_user', 'authenticated-user', 'user'].includes(raw)) return 'authenticated_user'
  if (['system', 'policy', 'scheduler'].includes(raw)) return 'system'
  if (['tool_output', 'tool-output', 'retrieval', 'webpage', 'email', 'document'].includes(raw)) return 'tool_output'
  if (['memory', 'agent_memory', 'agent-memory'].includes(raw)) return 'memory'
  if (['untrusted_content', 'untrusted-content', 'external', 'public_web'].includes(raw)) return 'untrusted_content'
  return 'unknown'
}

export function estimateBlastRadius(request: ActionRequest): BlastRadius {
  const ctx = request.context as Record<string, unknown>
  const factors: string[] = []
  let score = 0

  const action = request.action
  const reversible = ctx.reversible === true
    ? true
    : ctx.reversible === false
      ? false
      : !IRREVERSIBLE_ACTIONS.has(action)

  if (!reversible) {
    score += 22
    factors.push('irreversible_or_hard_to_undo')
  }

  const dataSensitivity = normalizeSensitivity(ctx.dataSensitivity ?? ctx.sensitivity)
  if (dataSensitivity) {
    const add = {
      public: 0,
      internal: 10,
      confidential: 22,
      secret: 32,
      regulated: 38,
    }[dataSensitivity]
    score += add
    if (add > 0) factors.push(`data_${dataSensitivity}`)
  }

  const destination = String(ctx.destination ?? ctx.to ?? ctx.recipient ?? '')
  const externalDestination =
    ctx.externalDestination === true ||
    /@/.test(destination) ||
    /^https?:\/\//.test(destination)
  if (externalDestination) {
    score += 16
    factors.push('external_destination')
  }

  const physicalWorld = ctx.physicalWorld === true || PHYSICAL_ACTIONS.has(action)
  if (physicalWorld) {
    score += 30
    factors.push('physical_world_effect')
  }

  const estimatedValue = Number(ctx.amount ?? ctx.valueUsd ?? ctx.estimatedValue ?? 0)
  if (Number.isFinite(estimatedValue) && estimatedValue > 0) {
    if (estimatedValue >= 10_000) {
      score += 30
      factors.push('high_value')
    } else if (estimatedValue >= 1_000) {
      score += 18
      factors.push('material_value')
    } else {
      score += 8
      factors.push('monetary_value')
    }
  }

  const sourceTrust = deriveSourceTrust(request)
  if (sourceTrust === 'untrusted_content' || sourceTrust === 'tool_output') {
    score += 18
    factors.push(`source_${sourceTrust}`)
  }

  score = Math.max(0, Math.min(100, score))
  const level =
    score >= 80 ? 'critical' :
    score >= 55 ? 'high' :
    score >= 25 ? 'medium' :
    'low'

  return {
    level,
    score,
    factors,
    reversible,
    dataSensitivity,
    externalDestination,
    physicalWorld,
    estimatedValue: estimatedValue > 0 ? estimatedValue : undefined,
  }
}

function normalizeSensitivity(value: unknown): BlastRadius['dataSensitivity'] {
  const v = String(value ?? '').toLowerCase()
  if (v === 'public') return 'public'
  if (v === 'internal') return 'internal'
  if (v === 'confidential') return 'confidential'
  if (v === 'secret') return 'secret'
  if (v === 'regulated' || v === 'phi' || v === 'pii' || v === 'pci') return 'regulated'
  return undefined
}
