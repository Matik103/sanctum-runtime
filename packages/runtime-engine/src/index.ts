import { randomUUID } from 'node:crypto'
import { AuditStore } from '@sanctum/audit-system'
import { OllamaBridge } from '@sanctum/ollama-bridge'
import { PolicyEngine } from '@sanctum/policy-engine'
import type { ActionRequest, ActionResult, Decision, EvaluationMode, RiskLevel } from '@sanctum/runtime'
import { detectAnomalies } from './anomaly.js'
import { decisionReasoningSuffix, resolveDecision } from './decision.js'
import { heuristicRiskFloor, heuristicRiskReason, mergeRisk } from './risk-heuristics.js'

export type RuntimeEngineOptions = {
  policyEngine?: PolicyEngine
  auditStore?: AuditStore
  ollamaBridge?: OllamaBridge
  forceOfflineMode?: boolean
}

export class RuntimeEngine {
  private policyEngine: PolicyEngine
  private auditStore: AuditStore
  private ollamaBridge: OllamaBridge
  private forceOfflineMode: boolean

  constructor(options: RuntimeEngineOptions = {}) {
    this.policyEngine = options.policyEngine ?? new PolicyEngine(undefined, undefined)
    this.auditStore = options.auditStore ?? new AuditStore()
    this.ollamaBridge = options.ollamaBridge ?? new OllamaBridge()
    this.forceOfflineMode = options.forceOfflineMode ?? false
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine
  }

  getAuditStore(): AuditStore {
    return this.auditStore
  }

  async init(): Promise<void> {
    await this.auditStore.loadFromDisk()
  }

  async verifyAction(
    request: ActionRequest,
    options: { offlineMode?: boolean; correlationId?: string } = {},
  ): Promise<ActionResult> {
    const correlationId = options.correlationId ?? randomUUID()
    const id = randomUUID()
    const forceOffline = options.offlineMode === true
    const ollamaConnected = await this.ollamaBridge.isConnected()
    const useHeuristicsOnly =
      forceOffline || this.forceOfflineMode || !ollamaConnected

    let evaluationMode: EvaluationMode = 'online_model'
    if (forceOffline) evaluationMode = 'offline_forced'
    else if (!ollamaConnected) evaluationMode = 'offline_no_ollama'

    const anomalyFlags = detectAnomalies(request)
    const riskFloor = heuristicRiskFloor(request, anomalyFlags)
    const policyEval = this.policyEngine.evaluate(request, useHeuristicsOnly)

    let risk: RiskLevel = riskFloor
    let reasoning = 'Policy evaluation passed.'
    let modelConfidence: number | undefined
    let decision: Decision = 'APPROVED'
    let modelInvoked = false

    if (policyEval.violations.includes('policy_auto_block')) {
      decision = 'BLOCKED'
      risk = 'high'
      reasoning = 'Blocked by policy (auto-block).'
    } else if (policyEval.violations.includes('policy_block_when_offline')) {
      decision = 'BLOCKED'
      risk = 'high'
      reasoning = 'Blocked: action not permitted while offline.'
    } else if (policyEval.violations.includes('policy_actor_not_allowed')) {
      decision = 'BLOCKED'
      risk = 'high'
      reasoning = 'Blocked: actor not in allowed list.'
    } else if (anomalyFlags.includes('suspicious_prompt_pattern')) {
      decision = 'BLOCKED'
      risk = 'high'
      reasoning = 'Blocked: suspicious prompt / injection pattern detected.'
    } else if (!useHeuristicsOnly) {
      const { assessment, error } = await this.ollamaBridge.analyzeAction(request)

      if (assessment) {
        modelInvoked = true
        evaluationMode = 'online_model'
        const modelRisk = assessment.risk
        risk = mergeRisk(modelRisk, riskFloor)
        modelConfidence = assessment.confidence
        reasoning = assessment.reason
        if (risk !== modelRisk) {
          const hint = heuristicRiskReason(request, anomalyFlags, riskFloor)
          if (hint) reasoning = `${hint} Model said ${modelRisk}; Sanctum uses ${risk}.`
        }

        decision = resolveDecision({
          policy: policyEval.policy,
          risk,
          modelRecommendation: assessment.recommendation,
          anomalyFlags,
        })
        const suffix = decisionReasoningSuffix(
          decision,
          policyEval.policy,
          assessment.recommendation,
        )
        if (suffix) reasoning = `${reasoning} ${suffix}`
      } else {
        evaluationMode = 'offline_model_failed'
        reasoning = error
          ? `Model call failed (${error}). Heuristic policy and anomaly rules applied.`
          : 'Model call failed. Heuristic policy and anomaly rules applied.'

        if (policyEval.policy.requiresVerification || anomalyFlags.length > 0) {
          decision = 'REQUIRE_VERIFICATION'
          risk = mergeRisk(risk, riskFloor)
          const hint = heuristicRiskReason(request, anomalyFlags, riskFloor)
          if (hint && !reasoning.includes('Sanctum')) reasoning = `${hint} ${reasoning}`
        }

        if (
          anomalyFlags.includes('unsafe_command_chain') &&
          policyEval.policy.autoBlock
        ) {
          decision = 'BLOCKED'
          risk = 'high'
          reasoning = 'Blocked: unsafe command chain (auto-block enabled in Policy Manager).'
        }
      }
    } else {
      if (evaluationMode === 'offline_forced') {
        reasoning =
          'Offline mode (forced): heuristic policy and anomaly rules applied — no model call.'
      } else {
        reasoning =
          'Offline mode (Ollama unavailable): heuristic policy and anomaly rules applied — no model call.'
      }

      risk = mergeRisk(risk, riskFloor)
      const hint = heuristicRiskReason(request, anomalyFlags, riskFloor)
      if (hint) reasoning = `${hint} ${reasoning}`

      decision = resolveDecision({
        policy: policyEval.policy,
        risk,
        anomalyFlags,
      })
      const suffix = decisionReasoningSuffix(decision, policyEval.policy)
      if (suffix) reasoning = `${reasoning} ${suffix}`
    }

    if (
      decision === 'APPROVED' &&
      policyEval.policy.requiresVerification &&
      !policyEval.violations.length &&
      !policyEval.policy.autoBlock
    ) {
      decision = 'REQUIRE_VERIFICATION'
      reasoning = `Policy requires verification for "${request.action}".`
    }

    const result: ActionResult = {
      id,
      correlationId,
      actor: request.actor,
      action: request.action,
      context: request.context,
      decision,
      risk,
      reasoning,
      policyPath: policyEval.policyPath,
      modelConfidence,
      anomalyFlags,
      timestamp: new Date().toISOString(),
      offlineMode: evaluationMode !== 'online_model',
      evaluationMode,
      modelInvoked,
      ollamaConnected,
    }

    await this.auditStore.append(result)
    return result
  }

  async getStatus(): Promise<{
    runtimeOnline: boolean
    ollamaConnected: boolean
    ollamaModel?: string
    systemOfflineCapable: boolean
    policyCount: number
    auditCount: number
  }> {
    const ollamaConnected = await this.ollamaBridge.isConnected()
    return {
      runtimeOnline: true,
      ollamaConnected,
      ollamaModel: ollamaConnected ? this.ollamaBridge.getModel() : undefined,
      systemOfflineCapable: this.forceOfflineMode || !ollamaConnected,
      policyCount: Object.keys(this.policyEngine.getPolicies()).length,
      auditCount: this.auditStore.count(),
    }
  }
}
