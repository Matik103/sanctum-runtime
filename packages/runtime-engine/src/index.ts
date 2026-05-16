import { randomUUID } from 'node:crypto'
import { AuditStore } from '@sanctum/audit-system'
import {
  createRiskModelFromEnv,
  type RiskModelProvider,
} from '@sanctum/risk-model'
import { OllamaBridge } from '@sanctum/ollama-bridge'
import { PolicyEngine } from '@sanctum/policy-engine'
import type {
  ActionPolicy,
  ActionRequest,
  ActionResult,
  Decision,
  EvaluationMode,
  PolicyMap,
  RiskLevel,
} from '@sanctum-runtime/sdk'
import {
  buildHumanAuditRecord,
  verificationStateFromDecision,
  type VerificationStatus,
} from '@sanctum-runtime/sdk'
import { maybeSyncAuditToSupabase } from './supabase-audit.js'
import { isSupabaseConfigured } from './supabase-client.js'
import {
  deletePolicyFromSupabase,
  loadPoliciesFromSupabase,
  syncPoliciesToSupabase,
} from './supabase-policies.js'
import {
  dispatchWebhooks,
  getWebhookStatus,
  webhookEventForDecision,
} from './webhooks.js'
import { detectAnomalies } from './anomaly.js'
import { decisionReasoningSuffix, resolveDecision } from './decision.js'
import { heuristicRiskFloor, heuristicRiskReason, mergeRisk } from './risk-heuristics.js'

export type RuntimeEngineOptions = {
  policyEngine?: PolicyEngine
  auditStore?: AuditStore
  /** Pluggable risk model (Ollama, OpenAI-compatible, etc.). */
  riskModel?: RiskModelProvider | null
  /** @deprecated Use `riskModel` or env `SANCTUM_RISK_PROVIDER`. */
  ollamaBridge?: OllamaBridge
  forceOfflineMode?: boolean
}

export class RuntimeEngine {
  private policyEngine: PolicyEngine
  private auditStore: AuditStore
  private riskModel: RiskModelProvider | null
  private forceOfflineMode: boolean

  constructor(options: RuntimeEngineOptions = {}) {
    this.policyEngine = options.policyEngine ?? new PolicyEngine(undefined, undefined)
    this.policyEngine.setAfterPersist(async (policies) => {
      await syncPoliciesToSupabase(policies)
    })
    this.policyEngine.setOnDelete(async (action) => {
      await deletePolicyFromSupabase(action)
    })
    this.auditStore = options.auditStore ?? new AuditStore()
    if (options.riskModel !== undefined) {
      this.riskModel = options.riskModel
    } else if (options.ollamaBridge) {
      const bridge = options.ollamaBridge
      this.riskModel = {
        providerId: 'ollama',
        getInfo: () => ({
          provider: 'ollama',
          model: bridge.getModel(),
          endpoint: bridge.getBaseUrl(),
        }),
        isConnected: () => bridge.isConnected(),
        analyzeAction: (req, opts) => bridge.analyzeAction(req, opts),
      }
    } else {
      this.riskModel = createRiskModelFromEnv()
    }
    this.forceOfflineMode = options.forceOfflineMode ?? false
  }

  getRiskModel(): RiskModelProvider | null {
    return this.riskModel
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine
  }

  getAuditStore(): AuditStore {
    return this.auditStore
  }

  async init(): Promise<void> {
    await this.policyEngine.load()
    const fromDb = await loadPoliciesFromSupabase()
    if (fromDb && Object.keys(fromDb).length > 0) {
      this.policyEngine.mergePolicies(fromDb)
    }
    await this.auditStore.loadFromDisk()
  }

  async resolveAuditEntry(
    id: string,
    resolution: {
      decision: 'APPROVED' | 'BLOCKED'
      resolvedBy?: string
      note?: string
    },
  ): Promise<ActionResult | null> {
    const existing = this.auditStore.getById(id)
    if (!existing) return null
    if (existing.decision !== 'REQUIRE_VERIFICATION') {
      return existing
    }

    const who = resolution.resolvedBy ?? 'operator'
    const verb = resolution.decision === 'APPROVED' ? 'Approved' : 'Denied'
    const humanResolution = `${verb} by ${who}${resolution.note ? ` — ${resolution.note}` : ''}`

    const updated: ActionResult = {
      ...existing,
      decision: resolution.decision,
      humanResolution,
      resolvedAt: new Date().toISOString(),
      resolvedBy: who,
      reasoning: `${existing.reasoning} ${humanResolution}.`,
      humanRecord: buildHumanAuditRecord({
        ...existing,
        decision: resolution.decision,
        reasoning: `${existing.reasoning} ${humanResolution}.`,
      }),
    }

    const saved = (await this.auditStore.updateEntry(id, updated)) ?? null
    if (saved) {
      void dispatchWebhooks('verification.resolved', saved)
      await maybeSyncAuditToSupabase(saved)
    }
    return saved
  }

  exportPoliciesYaml(): string {
    return this.policyEngine.exportPoliciesYaml()
  }

  async importPoliciesYaml(yaml: string, merge = true): Promise<PolicyMap> {
    return this.policyEngine.importPoliciesYaml(yaml, merge)
  }

  getWebhookStatus() {
    return getWebhookStatus()
  }

  getVerificationStatus(correlationId: string): VerificationStatus {
    const entry = this.auditStore.findLatestByCorrelationId(correlationId)
    if (!entry) {
      return { correlationId, status: 'not_found' }
    }
    return {
      correlationId,
      status: verificationStateFromDecision(entry.decision),
      entry,
    }
  }

  getPoliciesForOrg(orgId: string): PolicyMap {
    const prefix = `${orgId}:`
    const scoped: PolicyMap = {}
    for (const [key, policy] of Object.entries(this.policyEngine.getPolicies())) {
      if (key.startsWith(prefix)) {
        scoped[key.slice(prefix.length)] = policy as ActionPolicy
      }
    }
    return scoped
  }

  async verifyAction(
    request: ActionRequest,
    options: { offlineMode?: boolean; correlationId?: string } = {},
  ): Promise<ActionResult> {
    const correlationId = options.correlationId ?? randomUUID()
    const id = randomUUID()
    const forceOffline = options.offlineMode === true
    const riskModelConnected = this.riskModel
      ? await this.riskModel.isConnected()
      : false
    const useHeuristicsOnly =
      forceOffline || this.forceOfflineMode || !riskModelConnected

    let evaluationMode: EvaluationMode = 'online_model'
    if (forceOffline) evaluationMode = 'offline_forced'
    else if (!riskModelConnected) evaluationMode = 'offline_no_ollama'

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
    } else if (!useHeuristicsOnly && this.riskModel) {
      const { assessment, error } = await this.riskModel.analyzeAction(request, {
        riskPrompt: policyEval.policy.riskPrompt,
      })

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

    const partial = {
      actor: request.actor,
      action: request.action,
      context: request.context,
      decision,
      anomalyFlags,
      reasoning,
    }

    const result: ActionResult = {
      id,
      correlationId,
      ...partial,
      risk,
      policyPath: policyEval.policyPath,
      modelConfidence,
      timestamp: new Date().toISOString(),
      offlineMode: evaluationMode !== 'online_model',
      evaluationMode,
      modelInvoked,
      ollamaConnected: riskModelConnected,
      humanRecord: buildHumanAuditRecord(partial),
    }

    await this.auditStore.append(result)
    await maybeSyncAuditToSupabase(result)

    const hookEvent = webhookEventForDecision(result.decision, false)
    if (hookEvent) void dispatchWebhooks(hookEvent, result)

    return result
  }

  async getStatus(): Promise<{
    runtimeOnline: boolean
    ollamaConnected: boolean
    ollamaUrl?: string
    ollamaModel?: string
    riskProvider: 'ollama' | 'openai' | 'none'
    riskModel?: string
    riskModelConnected: boolean
    riskEndpoint?: string
    systemOfflineCapable: boolean
    policyCount: number
    auditCount: number
    supabaseConfigured: boolean
  }> {
    const info = this.riskModel?.getInfo()
    const riskModelConnected = this.riskModel
      ? await this.riskModel.isConnected()
      : false
    const provider = info?.provider ?? 'none'
    return {
      runtimeOnline: true,
      ollamaConnected: provider === 'ollama' && riskModelConnected,
      ollamaUrl: provider === 'ollama' ? info?.endpoint : undefined,
      ollamaModel:
        provider === 'ollama' && riskModelConnected ? info?.model : undefined,
      riskProvider: provider,
      riskModel: info?.model,
      riskModelConnected,
      riskEndpoint: info?.endpoint,
      systemOfflineCapable: this.forceOfflineMode || !riskModelConnected,
      policyCount: Object.keys(this.policyEngine.getPolicies()).length,
      auditCount: this.auditStore.count(),
      supabaseConfigured: isSupabaseConfigured(),
    }
  }
}
