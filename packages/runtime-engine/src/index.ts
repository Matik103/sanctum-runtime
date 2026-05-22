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
import { deriveSourceTrust, estimateBlastRadius } from './action-context.js'
import { issueActionToken, verifyActionToken } from './action-token.js'

export { deriveSourceTrust, estimateBlastRadius } from './action-context.js'
export { issueActionToken, verifyActionToken } from './action-token.js'

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

    // Dual approver: first APPROVED resolution records firstApproved* but
    // keeps decision=REQUIRE_VERIFICATION until a DIFFERENT approver acts.
    if (
      resolution.decision === 'APPROVED' &&
      existing.requiresSecondApproval &&
      !existing.firstApprovedBy
    ) {
      const partial: ActionResult = {
        ...existing,
        firstApprovedBy: who,
        firstApprovedAt: new Date().toISOString(),
        reasoning: `${existing.reasoning} First approval by ${who} — awaiting second approver.`,
      }
      const saved = (await this.auditStore.updateEntry(id, partial)) ?? partial
      await maybeSyncAuditToSupabase(saved)
      return saved
    }
    // Second-approver guard: the second approver must be distinct from the first
    if (
      resolution.decision === 'APPROVED' &&
      existing.requiresSecondApproval &&
      existing.firstApprovedBy === who
    ) {
      throw new Error('dual_approver_required: a different operator must give the second approval')
    }

    const verb = resolution.decision === 'APPROVED' ? 'Approved' : 'Denied'
    const dualNote =
      existing.requiresSecondApproval && resolution.decision === 'APPROVED' && existing.firstApprovedBy
        ? ` (dual-approval: first ${existing.firstApprovedBy}, second ${who})`
        : ''
    const humanResolution = `${verb} by ${who}${dualNote}${resolution.note ? ` — ${resolution.note}` : ''}`

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
    // Mint an action token when resolution is APPROVED (executor needs it)
    if (resolution.decision === 'APPROVED') {
      const token = issueActionToken(updated)
      if (token) updated.actionToken = token
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

  /**
   * Simulate a verify call without writing an audit entry — used by the
   * policy simulator and "what if?" UI in the dashboard.
   */
  async simulateAction(request: ActionRequest): Promise<{
    simulation: true
    decision: Decision
    risk: RiskLevel
    policyPath: string
    anomalyFlags: string[]
    sourceTrust: ReturnType<typeof deriveSourceTrust>
    blastRadius: ReturnType<typeof estimateBlastRadius>
    conditionMatched: boolean
    policyFlags: {
      autoBlock: boolean
      requiresVerification: boolean
      blockWhenOffline: boolean
      allowedActors: string[]
      conditions: NonNullable<ActionPolicy['conditions']>
    }
  }> {
    const anomalyFlags = detectAnomalies(request)
    const policyEval = this.policyEngine.evaluate(request, false)
    const riskFloor = heuristicRiskFloor(request, anomalyFlags)
    const sourceTrust = deriveSourceTrust(request)
    const blastRadius = estimateBlastRadius(request)
    let decision: Decision = 'APPROVED'
    if (policyEval.violations.includes('policy_auto_block')) decision = 'BLOCKED'
    else if (policyEval.policy.requiresVerification) decision = 'REQUIRE_VERIFICATION'
    else if (riskFloor === 'high') decision = 'REQUIRE_VERIFICATION'

    return {
      simulation: true,
      decision,
      risk: riskFloor,
      policyPath: policyEval.policyPath,
      anomalyFlags,
      sourceTrust,
      blastRadius,
      conditionMatched: (policyEval.policy.conditions ?? []).length > 0,
      policyFlags: {
        autoBlock: policyEval.policy.autoBlock,
        requiresVerification: policyEval.policy.requiresVerification,
        blockWhenOffline: policyEval.policy.blockWhenOffline,
        allowedActors: policyEval.policy.allowedActors ?? [],
        conditions: policyEval.policy.conditions ?? [],
      },
    }
  }

  /**
   * Replay historical audit entries against the *current* policy set.
   * Returns the diff so operators can see "if this policy had existed
   * yesterday, what would have been blocked?"
   */
  async replayAudit(limit = 100, orgId?: string): Promise<{
    replayedAt: string
    count: number
    decisions: Record<Decision, number>
    changedCount: number
    changed: Array<{
      id: string
      actor: string
      action: string
      previousDecision: Decision
      replayDecision: Decision
      previousRisk: RiskLevel
      replayRisk: RiskLevel
      policyPath: string
      anomalyFlags: string[]
    }>
  }> {
    const entries = await this.listAudit(limit, orgId)
    const decisions: Record<Decision, number> = { APPROVED: 0, BLOCKED: 0, REQUIRE_VERIFICATION: 0 }
    const changed: Array<{
      id: string
      actor: string
      action: string
      previousDecision: Decision
      replayDecision: Decision
      previousRisk: RiskLevel
      replayRisk: RiskLevel
      policyPath: string
      anomalyFlags: string[]
    }> = []
    for (const entry of entries) {
      const sim = await this.simulateAction({
        actor: entry.actor,
        action: entry.action,
        context: entry.context,
      })
      decisions[sim.decision] = (decisions[sim.decision] ?? 0) + 1
      if (sim.decision !== entry.decision) {
        changed.push({
          id: entry.id,
          actor: entry.actor,
          action: entry.action,
          previousDecision: entry.decision,
          replayDecision: sim.decision,
          previousRisk: entry.risk,
          replayRisk: sim.risk,
          policyPath: sim.policyPath,
          anomalyFlags: sim.anomalyFlags,
        })
      }
    }
    return {
      replayedAt: new Date().toISOString(),
      count: entries.length,
      decisions,
      changedCount: changed.length,
      changed,
    }
  }

  /**
   * Compliance evidence summary — counts of approvals, blocks, signed
   * tokens issued, high-blast-radius events, untrusted-source events.
   */
  async evidenceSummary(limit = 200, orgId?: string): Promise<{
    generatedAt: string
    orgId?: string
    controls: Record<string, boolean>
    policyCount: number
    auditWindow: {
      sampledEvents: number
      approved: number
      blocked: number
      verificationRequired: number
      signedApprovalTokens: number
      highBlastRadiusEvents: number
      untrustedSourceEvents: number
    }
    evidence: string[]
  }> {
    const entries = await this.listAudit(limit, orgId)
    let approved = 0, blocked = 0, verify = 0, tokens = 0, highBlast = 0, untrusted = 0
    for (const e of entries) {
      if (e.decision === 'APPROVED') approved++
      else if (e.decision === 'BLOCKED') blocked++
      else verify++
      if (e.actionToken) tokens++
      if (e.blastRadius && (e.blastRadius.level === 'high' || e.blastRadius.level === 'critical')) highBlast++
      if (e.sourceTrust === 'untrusted_content' || e.sourceTrust === 'tool_output') untrusted++
    }
    return {
      generatedAt: new Date().toISOString(),
      orgId,
      controls: {
        actionVerification: true,
        signedActionTokens: tokens > 0,
        sourceTrustClassification: untrusted >= 0,
        blastRadiusScoring: entries.some((e) => !!e.blastRadius),
        policyReplay: true,
        humanVerification: verify > 0,
        auditTrail: entries.length > 0,
      },
      policyCount: Object.keys(this.policyEngine.getPolicies()).length,
      auditWindow: {
        sampledEvents: entries.length,
        approved,
        blocked,
        verificationRequired: verify,
        signedApprovalTokens: tokens,
        highBlastRadiusEvents: highBlast,
        untrustedSourceEvents: untrusted,
      },
      evidence: [
        `Sampled ${entries.length} audit events (most recent first)`,
        `${blocked} blocked, ${verify} held for verification, ${approved} approved`,
        `${tokens} signed action tokens issued for downstream executors`,
        `${highBlast} high/critical blast-radius events captured`,
        `${untrusted} actions originating from untrusted content / tool output flagged`,
      ],
    }
  }

  /**
   * Sweep audit entries that are still REQUIRE_VERIFICATION past their
   * policy's autoEscalateAfterMinutes, mark them escalated, and return them
   * so the API layer can re-fire push notifications / alerts.
   */
  async sweepEscalations(): Promise<ActionResult[]> {
    const pending = this.auditStore
      .list(500)
      .filter((e) => e.decision === 'REQUIRE_VERIFICATION' && !e.escalatedAt)
    const policies = this.policyEngine.getPolicies()
    const now = Date.now()
    const escalated: ActionResult[] = []
    for (const e of pending) {
      const orgId = typeof e.context?.org_id === 'string' ? e.context.org_id : undefined
      const policy = (orgId && policies[`${orgId}:${e.action}`]) || policies[e.action]
      const minutes =
        policy?.autoEscalateAfterMinutes ??
        // Default: high/critical blast radius escalates after 5 min
        (e.blastRadius?.level === 'critical' ? 5 :
         e.blastRadius?.level === 'high' ? 15 : undefined)
      if (!minutes) continue
      const age = (now - new Date(e.timestamp).getTime()) / 60_000
      if (age < minutes) continue
      const updated: ActionResult = { ...e, escalatedAt: new Date().toISOString() }
      const saved = (await this.auditStore.updateEntry(e.id, updated)) ?? updated
      await maybeSyncAuditToSupabase(saved)
      escalated.push(saved)
    }
    return escalated
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

    const sourceTrust = deriveSourceTrust(request)
    const blastRadius = estimateBlastRadius(request)

    // Require a second approver when policy says so OR blast radius is critical
    const requiresSecondApproval =
      decision === 'REQUIRE_VERIFICATION' &&
      (policyEval.policy.requireSecondApprover === true || blastRadius.level === 'critical')

    // Auto-elevate from APPROVED to REQUIRE_VERIFICATION when blast radius is
    // critical and instruction source is untrusted — never silently approve.
    const elevatedDecision: Decision =
      decision === 'APPROVED' &&
      blastRadius.level === 'critical' &&
      (sourceTrust === 'untrusted_content' || sourceTrust === 'tool_output')
        ? 'REQUIRE_VERIFICATION'
        : decision

    // parentAuditId allows callers to thread an action into an existing causal chain
    const parentCtxId = (request.context as Record<string, unknown>)?.parentAuditId
    const parentAuditId = typeof parentCtxId === 'string' ? parentCtxId : undefined

    const result: ActionResult = {
      id,
      correlationId,
      ...partial,
      decision: elevatedDecision,
      risk,
      policyPath: policyEval.policyPath,
      modelConfidence,
      timestamp: new Date().toISOString(),
      offlineMode: evaluationMode !== 'online_model',
      evaluationMode,
      modelInvoked,
      ollamaConnected: riskModelConnected,
      humanRecord: buildHumanAuditRecord({ ...partial, decision: elevatedDecision }),
      sourceTrust,
      blastRadius,
      requiresSecondApproval:
        requiresSecondApproval ||
        (elevatedDecision === 'REQUIRE_VERIFICATION' && blastRadius.level === 'critical')
          ? true
          : undefined,
      parentAuditId,
    }

    // Mint a signed action token for APPROVED decisions
    if (result.decision === 'APPROVED') {
      const token = issueActionToken(result)
      if (token) result.actionToken = token
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
