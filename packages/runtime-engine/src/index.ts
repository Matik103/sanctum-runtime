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
import {
  fetchAuditById,
  loadAuditFromSupabase,
  maybeSyncAuditToSupabase,
} from './supabase-audit.js'
import { isSupabaseConfigured } from './supabase-client.js'
import { buildPolicyReasoning } from './policy-reasoning.js'
import {
  deletePolicyFromSupabase,
  loadPoliciesFromSupabase,
  seedPoliciesToSupabaseIfEmpty,
  syncPoliciesToSupabase,
} from './supabase-policies.js'
import {
  dispatchWebhooks,
  getWebhookStatus,
  webhookEventForDecision,
} from './webhooks.js'
import { detectAnomalies } from './anomaly.js'
import { resolveDecision } from './decision.js'
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
      if (isSupabaseConfigured()) {
        await syncPoliciesToSupabase(policies)
      }
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
    if (isSupabaseConfigured()) {
      const fromDb = await loadPoliciesFromSupabase()
      if (fromDb && Object.keys(fromDb).length > 0) {
        this.policyEngine.applySupabasePolicies(fromDb)
        await this.policyEngine.persistToDisk()
      } else {
        await seedPoliciesToSupabaseIfEmpty(this.policyEngine.getPolicies())
      }
    }
    await this.auditStore.loadFromDisk()
    await this.hydrateAuditFromSupabase()
  }

  /** Reload audit from Supabase into memory (call after redeploy or before list). */
  async hydrateAuditFromSupabase(limit = 200, orgId?: string): Promise<void> {
    if (!isSupabaseConfigured()) return
    const fromDb = await loadAuditFromSupabase(limit, orgId)
    if (fromDb.length > 0) {
      this.auditStore.hydrate(fromDb, limit)
    }
  }

  async listAudit(limit = 50, orgId?: string): Promise<ActionResult[]> {
    if (isSupabaseConfigured()) {
      const fromDb = await loadAuditFromSupabase(Math.max(limit, 100), orgId)
      if (fromDb.length > 0) {
        this.auditStore.hydrate(fromDb, 500)
        return fromDb.slice(0, limit)
      }
    }
    if (orgId) return this.auditStore.listByOrg(orgId, limit)
    return this.auditStore.list(limit)
  }

  async resolveAuditEntry(
    id: string,
    resolution: {
      decision: 'APPROVED' | 'BLOCKED'
      resolvedBy?: string
      note?: string
    },
  ): Promise<ActionResult | null> {
    let existing = this.auditStore.getById(id)
    if (!existing && isSupabaseConfigured()) {
      const fromDb = await fetchAuditById(id)
      if (fromDb) {
        this.auditStore.hydrate([fromDb], 500)
        existing = fromDb
      }
    }
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

  /** Remove org-scoped keys without re-upserting the full policy map (marketplace uninstall). */
  async removePolicyKeys(keys: string[]): Promise<void> {
    const engine = this.policyEngine
    for (const key of keys) {
      if (!key.includes(':')) continue
      engine.forgetPolicy(key)
      try {
        await deletePolicyFromSupabase(key)
      } catch (err) {
        console.error(`[sanctum] remove policy ${key} failed:`, err)
      }
    }
    try {
      await engine.persistToDisk()
    } catch (err) {
      console.error('[sanctum] policy disk persist after batch remove failed:', err)
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
    let modelReason: string | undefined
    let modelConfidence: number | undefined
    let decision: Decision = 'APPROVED'
    let modelInvoked = false

    if (policyEval.violations.includes('policy_auto_block')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (policyEval.violations.includes('policy_block_when_offline')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (policyEval.violations.includes('policy_actor_not_allowed')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (!useHeuristicsOnly && this.riskModel) {
      const RISK_MODEL_TIMEOUT_MS = 15_000
      const timeoutError = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('risk_model_timeout')), RISK_MODEL_TIMEOUT_MS),
      )
      const { assessment, error } = await Promise.race([
        this.riskModel.analyzeAction(request, { riskPrompt: policyEval.policy.riskPrompt }),
        timeoutError.catch((e: Error) => ({ assessment: null, error: e.message })),
      ])

      if (assessment) {
        modelInvoked = true
        evaluationMode = 'online_model'
        const modelRisk = assessment.risk
        risk = mergeRisk(modelRisk, riskFloor)
        modelConfidence = assessment.confidence
        modelReason = assessment.reason
        if (risk !== modelRisk) {
          const hint = heuristicRiskReason(request, anomalyFlags, riskFloor)
          modelReason = hint
            ? `${hint} Risk model suggested ${modelRisk}; Sanctum applied ${risk} given policy.`
            : `${assessment.reason} Sanctum applied ${risk} given policy.`
        }

        decision = resolveDecision({
          policy: policyEval.policy,
          risk,
          modelRecommendation: assessment.recommendation,
          anomalyFlags,
        })
      } else {
        evaluationMode = 'offline_model_failed'
        if (error === 'risk_model_timeout') {
          console.warn('[sanctum] Risk model timed out after 15s — falling back to heuristics. Check model connectivity.')
        } else if (error) {
          console.error(`[sanctum] Risk model error: ${error}`)
        }
        modelReason = error ? `Risk model error: ${error}` : undefined

        decision = resolveDecision({
          policy: policyEval.policy,
          risk: mergeRisk(risk, riskFloor),
          anomalyFlags,
        })
        risk = mergeRisk(risk, riskFloor)

        if (
          anomalyFlags.includes('unsafe_command_chain') &&
          policyEval.policy.autoBlock
        ) {
          decision = 'BLOCKED'
          risk = 'high'
        }

        // Belt-and-suspenders: if model failed and policy requires verification,
        // never silently approve — hold for operator review
        if (decision === 'APPROVED' && policyEval.policy.requiresVerification) {
          decision = 'REQUIRE_VERIFICATION'
          console.warn(`[sanctum] Risk model failed; action "${request.action}" held for verification (requiresVerification=true)`)
        }
      }
    } else {
      // Offline / heuristics-only path
      risk = mergeRisk(risk, riskFloor)
      decision = resolveDecision({
        policy: policyEval.policy,
        risk,
        anomalyFlags,
      })

      // Explicit offline safety net: if policy requires human verification,
      // never approve automatically when the risk model is unavailable.
      if (decision === 'APPROVED' && policyEval.policy.requiresVerification) {
        decision = 'REQUIRE_VERIFICATION'
        console.warn(`[sanctum] Offline: action "${request.action}" held for verification (requiresVerification=true)`)
      }
    }

    // Final safety net: catch any path that might have slipped through
    if (decision === 'APPROVED' && policyEval.policy.requiresVerification) {
      decision = 'REQUIRE_VERIFICATION'
    }

    const reasoning = buildPolicyReasoning({
      request,
      policy: policyEval.policy,
      policyPath: policyEval.policyPath,
      decision,
      anomalyFlags,
      evaluationMode,
      risk,
      modelReason,
    })

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

    // Warn when verification is required but the system is degraded — operator
    // notifications may not reach their destination
    if (
      result.decision === 'REQUIRE_VERIFICATION' &&
      result.offlineMode
    ) {
      console.warn(
        `[sanctum] REQUIRE_VERIFICATION raised in offline/degraded mode ` +
        `(evaluationMode=${result.evaluationMode}) — ` +
        `actor="${request.actor}" action="${request.action}" id=${result.id}. ` +
        `Verify push/email notifications are reachable.`,
      )
    }

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

export { registerAnomalyRule, type AnomalyRule, detectAnomalies } from './anomaly.js'
export { loadPoliciesFromSupabase } from './supabase-policies.js'
export { heuristicRiskFloor } from './risk-heuristics.js'
