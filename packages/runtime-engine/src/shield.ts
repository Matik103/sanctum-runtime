import type {
  ActionRequest,
  ActionResult,
  BlastRadius,
  ShieldAssessment,
  ShieldSignal,
  SourceTrust,
} from '@sanctum-runtime/sdk'

type ShieldInputs = {
  anomalyFlags: string[]
  sourceTrust: SourceTrust
  blastRadius: BlastRadius
  recentAudit?: ActionResult[]
  now?: Date
}

const SECRET_PATTERN = /(read|access|export|copy|send|reveal|dump).*(secret|credential|password|token|api[_ -]?key|private[_ -]?key)|(secret|credential|password|token|api[_ -]?key).*(read|access|export|copy|send|reveal|dump)/i
const SECURITY_TAMPER_PATTERN = /(disable|turn[_ -]?off|bypass|delete|erase|stop|remove).*(security|alarm|camera|audit|log|monitor|guard|policy)|(delete|erase|wipe).*(audit|log)/i
const PHYSICAL_HARM_PATTERN = /(unlock|disable_alarm|move_robot|drive|fly|actuate|open_gate|administer|dispense|fire|launch)/i
const MONEY_PATTERN = /(transfer|wire|withdraw|pay|payment|charge|trade|refund)/i

const FLAG_SIGNALS: Record<string, Omit<ShieldSignal, 'id'>> = {
  suspicious_prompt_pattern: {
    category: 'injection',
    severity: 'high',
    label: 'Prompt injection signal',
    evidence: 'Retrieved or supplied instructions contain known bypass language.',
  },
  untrusted_source_side_effect: {
    category: 'injection',
    severity: 'high',
    label: 'Untrusted instruction side effect',
    evidence: 'Untrusted content attempted an external, irreversible, or physical side effect.',
  },
  privilege_escalation_chain: {
    category: 'behavior',
    severity: 'high',
    label: 'Privilege escalation chain',
    evidence: 'Recent actions match an escalation sequence.',
  },
  unsafe_command_chain: {
    category: 'behavior',
    severity: 'high',
    label: 'Unsafe action chain',
    evidence: 'The action belongs to an unusually long command chain.',
  },
  rapid_repeat_action: {
    category: 'behavior',
    severity: 'medium',
    label: 'Rapid repeat request',
    evidence: 'The same sensitive request was repeated within its causal chain.',
  },
  unusual_time_access: {
    category: 'behavior',
    severity: 'medium',
    label: 'Unusual execution time',
    evidence: 'A sensitive operation was requested outside expected hours.',
  },
  owner_absent_or_sleeping: {
    category: 'physical',
    severity: 'high',
    label: 'Vulnerable physical context',
    evidence: 'Physical access was requested while an owner is absent or sleeping.',
  },
  high_value_transfer: {
    category: 'financial',
    severity: 'high',
    label: 'High-value financial request',
    evidence: 'A transfer exceeded the elevated review threshold.',
  },
  high_blast_radius: {
    category: 'blast_radius',
    severity: 'high',
    label: 'High blast radius',
    evidence: 'The requested action can materially affect systems, people, or funds.',
  },
}

const SCORE: Record<ShieldSignal['severity'], number> = {
  low: 5,
  medium: 18,
  high: 32,
  critical: 55,
}

function addSignal(signals: ShieldSignal[], signal: ShieldSignal) {
  if (!signals.some((entry) => entry.id === signal.id)) signals.push(signal)
}

function contextText(request: ActionRequest): string {
  const ctx = request.context
  return [
    request.action,
    ctx.command,
    ctx.path,
    ctx.resource,
    ctx.permission,
    ctx.requestedPermission,
    ctx.prompt,
    ctx.instruction,
    ctx.message,
  ].filter((value): value is string => typeof value === 'string').join(' ')
}

function isRecent(entry: ActionResult, now: Date, minutes: number): boolean {
  return now.getTime() - new Date(entry.timestamp).getTime() <= minutes * 60_000
}

/**
 * Deterministic early-warning and containment assessment.
 *
 * Shield indicates risk and imposes a minimum decision. It does not claim to
 * infer human intent; it contains observable dangerous execution patterns.
 */
export function assessShield(request: ActionRequest, inputs: ShieldInputs): ShieldAssessment {
  const signals: ShieldSignal[] = []
  const ctx = request.context
  const text = contextText(request)
  const now = inputs.now ?? new Date()

  for (const flag of inputs.anomalyFlags) {
    const known = FLAG_SIGNALS[flag]
    if (known) addSignal(signals, { id: flag, ...known })
  }

  if (
    ctx.deviceKnown === false ||
    ctx.trustedDevice === false ||
    ctx.newDevice === true ||
    ctx.locationKnown === false ||
    ctx.unusualLocation === true
  ) {
    addSignal(signals, {
      id: 'unknown_device_or_location',
      category: 'identity',
      severity: 'medium',
      label: 'Unknown device or location',
      evidence: 'The action originated from a new or untrusted execution environment.',
    })
  }

  if (SECRET_PATTERN.test(text) || ctx.dataSensitivity === 'secret') {
    addSignal(signals, {
      id: 'secret_access_attempt',
      category: 'secrets',
      severity: inputs.sourceTrust === 'untrusted_content' ? 'critical' : 'high',
      label: 'Secret or credential access',
      evidence: 'The request targets credentials, tokens, or secret material.',
    })
  }

  if (SECURITY_TAMPER_PATTERN.test(text)) {
    addSignal(signals, {
      id: 'security_control_tamper',
      category: 'security_control',
      severity: 'critical',
      label: 'Security control tampering',
      evidence: 'The request attempts to disable monitoring, alarms, policies, or audit evidence.',
    })
  }

  if (
    PHYSICAL_HARM_PATTERN.test(request.action) &&
    (ctx.owner_sleeping === true || ctx.ownerPresent === false || ctx.safetyImpact === 'lethal')
  ) {
    addSignal(signals, {
      id: 'physical_safety_emergency',
      category: 'physical',
      severity: 'critical',
      label: 'Physical safety emergency',
      evidence: 'A physical-world action could endanger a person in the reported context.',
    })
  }

  if (
    MONEY_PATTERN.test(request.action) &&
    typeof inputs.blastRadius.estimatedValue === 'number' &&
    inputs.blastRadius.estimatedValue >= 10_000
  ) {
    addSignal(signals, {
      id: 'critical_financial_exposure',
      category: 'financial',
      severity: 'critical',
      label: 'Critical financial exposure',
      evidence: 'A high-value monetary action exceeded the containment threshold.',
    })
  }

  const actorHistory = (inputs.recentAudit ?? []).filter(
    (entry) => entry.actor === request.actor && isRecent(entry, now, 15),
  )
  const denied = actorHistory.filter((entry) => entry.decision === 'BLOCKED').length
  const interrupted = actorHistory.filter(
    (entry) => entry.decision === 'BLOCKED' || entry.decision === 'REQUIRE_VERIFICATION',
  ).length
  if (denied >= 2) {
    addSignal(signals, {
      id: 'repeated_blocked_attempts',
      category: 'behavior',
      severity: 'critical',
      label: 'Repeated blocked attempts',
      evidence: 'This actor repeated dangerous behavior after multiple blocks in 15 minutes.',
    })
  } else if (interrupted >= 3) {
    addSignal(signals, {
      id: 'approval_fatigue_pattern',
      category: 'behavior',
      severity: 'high',
      label: 'Approval fatigue pattern',
      evidence: 'This actor generated repeated security interruptions in 15 minutes.',
    })
  }

  let score = Math.min(100, signals.reduce((sum, signal) => sum + SCORE[signal.severity], 0))
  if (inputs.blastRadius.level === 'critical') score = Math.max(score, 70)
  const critical = signals.some((signal) => signal.severity === 'critical') || score >= 80
  const high = !critical && (signals.some((signal) => signal.severity === 'high') || score >= 50)
  const elevated = !critical && !high && signals.length > 0
  const level: ShieldAssessment['level'] = critical ? 'critical' : high ? 'high' : elevated ? 'elevated' : 'clear'

  if (critical) {
    return {
      score,
      level,
      signals,
      requiredDecision: 'BLOCKED',
      automaticResponse: ['block_action', 'alert_operator'],
      recommendedResponse: [
        'revoke_temporary_permissions',
        'isolate_actor',
        'pause_runtime_session',
        'pause_fleet',
        'incident_review',
      ],
      summary: 'Critical threat indicators detected. Sanctum blocked execution and requires operator containment review.',
    }
  }
  if (high) {
    return {
      score,
      level,
      signals,
      requiredDecision: 'REQUIRE_VERIFICATION',
      automaticResponse: ['hold_for_review', 'alert_operator'],
      recommendedResponse: ['isolate_actor', 'incident_review'],
      summary: 'High-risk behavior detected. Sanctum held execution for operator review.',
    }
  }
  return {
    score,
    level,
    signals,
    automaticResponse: elevated ? ['alert_operator'] : [],
    recommendedResponse: elevated ? ['incident_review'] : [],
    summary: elevated
      ? 'Risk indicators detected. Sanctum recorded the event for review.'
      : 'No Shield threat indicators detected.',
  }
}
