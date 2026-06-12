import { randomUUID } from 'node:crypto'
import { AuditStore } from '@sanctum/audit-system'
import {
  createRiskModelFromEnv,
  type RiskModelProvider,
} from '@sanctum/risk-model'
import { OllamaBridge } from '@sanctum/ollama-bridge'
import { PolicyEngine } from '@sanctum/policy-engine'
import type {
  ActionExecution,
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
import { deriveActionIdentity, deriveSourceTrust, estimateBlastRadius } from './action-context.js'
import { issueActionToken, verifyActionToken } from './action-token.js'
import { assessShield } from './shield.js'

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

  async reportActionExecution(
    id: string,
    body: {
      actionToken: string
      status: ActionExecution['status']
      reportedBy?: string
      resultSummary?: string
      outputRef?: string
      error?: string
      durationMs?: number
    },
  ): Promise<ActionResult | null> {
    const payload = verifyActionToken(body.actionToken)
    if (!payload || payload.auditId !== id) {
      throw new Error('invalid_action_token')
    }

    let existing = this.auditStore.getById(id)
    if (!existing && isSupabaseConfigured()) {
      const fromDb = await fetchAuditById(id)
      if (fromDb) {
        this.auditStore.hydrate([fromDb], 500)
        existing = fromDb
      }
    }
    if (!existing) return null
    if (existing.decision !== 'APPROVED') {
      throw new Error('execution_report_requires_approved_action')
    }
    if (payload.actor !== existing.actor || payload.action !== existing.action) {
      throw new Error('action_token_scope_mismatch')
    }

    const execution: ActionExecution = {
      status: body.status,
      reportedAt: new Date().toISOString(),
      reportedBy: body.reportedBy,
      resultSummary: body.resultSummary,
      outputRef: body.outputRef,
      error: body.error,
      durationMs: body.durationMs,
    }

    const updated: ActionResult = {
      ...existing,
      execution,
      reasoning: `${existing.reasoning} Execution ${execution.status}${execution.resultSummary ? ` — ${execution.resultSummary}` : ''}.`,
      humanRecord: buildHumanAuditRecord({
        ...existing,
        reasoning: `${existing.reasoning} Execution ${execution.status}${execution.resultSummary ? ` — ${execution.resultSummary}` : ''}.`,
      }),
    }

    const saved = (await this.auditStore.updateEntry(id, updated)) ?? updated
    await maybeSyncAuditToSupabase(saved)
    return saved
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

    const sourceTrust = deriveSourceTrust(request)
    const blastRadius = estimateBlastRadius(request)
    const actionIdentity = deriveActionIdentity(request)
    const detectedAnomalies = detectAnomalies(request)
    const shield = assessShield(request, {
      anomalyFlags: detectedAnomalies,
      sourceTrust,
      blastRadius,
      recentAudit: this.auditStore.list(100),
    })
    const anomalyFlags = [
      ...new Set([...detectedAnomalies, ...shield.signals.map((signal) => signal.id)]),
    ]
    const riskFloor = heuristicRiskFloor(request, anomalyFlags)
    const policyEval = this.policyEngine.evaluate(request, useHeuristicsOnly)

    let risk: RiskLevel = mergeRisk(riskFloor, riskFromBlastRadius(blastRadius.level))
    let modelReason: string | undefined
    let modelConfidence: number | undefined
    let decision: Decision = 'APPROVED'
    let modelInvoked = false
    let riskModelProvider: 'ollama' | 'openai' | undefined
    let riskModelName: string | undefined

    if (shield.requiredDecision === 'BLOCKED') {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (shield.requiredDecision === 'REQUIRE_VERIFICATION') {
      decision = 'REQUIRE_VERIFICATION'
      risk = 'high'
    } else if (policyEval.violations.includes('policy_auto_block')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (policyEval.violations.includes('policy_block_when_offline')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (policyEval.violations.includes('policy_actor_not_allowed')) {
      decision = 'BLOCKED'
      risk = 'high'
    } else if (!useHeuristicsOnly && this.riskModel) {
      const configuredTimeout = Number(process.env.SANCTUM_RISK_TIMEOUT_MS)
      const RISK_MODEL_TIMEOUT_MS =
        Number.isFinite(configuredTimeout) && configuredTimeout >= 500 ? configuredTimeout : 8_000
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
        // Capture exact model identity at decision time — survives provider rotations
        const info = this.riskModel.getInfo()
        riskModelProvider = info.provider
        riskModelName = info.model
        const modelRisk = assessment.risk
        risk = mergeRisk(mergeRisk(modelRisk, riskFloor), riskFromBlastRadius(blastRadius.level))
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
          console.warn(`[sanctum] Risk model timed out after ${RISK_MODEL_TIMEOUT_MS}ms — falling back to heuristics. Check model connectivity.`)
        } else if (error) {
          console.error(`[sanctum] Risk model error: ${error}`)
        }
        modelReason = error ? `Risk model error: ${error}` : undefined

        decision = resolveDecision({
          policy: policyEval.policy,
          risk: mergeRisk(mergeRisk(risk, riskFloor), riskFromBlastRadius(blastRadius.level)),
          anomalyFlags,
        })
        risk = mergeRisk(mergeRisk(risk, riskFloor), riskFromBlastRadius(blastRadius.level))

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
      risk = mergeRisk(mergeRisk(risk, riskFloor), riskFromBlastRadius(blastRadius.level))
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

    // Fail-safe for unconfigured actions: if we are about to APPROVE an action
    // that has no explicit policy (fell back to the permissive DEFAULT_POLICY)
    // AND the risk model never actually produced an assessment (offline, timed
    // out, or errored), then this approval is "blind" — nothing intelligent
    // evaluated it. A runtime-trust product must not silently approve in that
    // case. Hold it for human verification and flag why.
    let blindApproveHeld = false
    if (decision === 'APPROVED' && !policyEval.matched && !modelInvoked) {
      decision = 'REQUIRE_VERIFICATION'
      blindApproveHeld = true
      if (!anomalyFlags.includes('unconfigured_action_unassessed')) {
        anomalyFlags.push('unconfigured_action_unassessed')
      }
      console.warn(
        `[sanctum] Held "${request.action}" for verification: no policy configured for this action and the risk model was unavailable (fail-safe, not auto-approved).`,
      )
    }

    const policyReasoning = buildPolicyReasoning({
      request,
      policy: policyEval.policy,
      policyPath: policyEval.policyPath,
      decision,
      anomalyFlags,
      evaluationMode,
      risk,
      modelReason,
    })
    let reasoning =
      shield.level === 'clear' ? policyReasoning : `${policyReasoning} ${shield.summary}`
    if (blindApproveHeld) {
      reasoning = `${reasoning} No policy is configured for "${request.action}" and the risk model was unavailable, so Sanctum held this action for human verification instead of auto-approving an unassessed action (fail-safe).`
    }

    const partial = {
      actor: request.actor,
      action: request.action,
      context: request.context,
      decision,
      anomalyFlags,
      reasoning,
    }

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
      riskModelProvider,
      riskModelName,
      ollamaConnected: riskModelConnected,
      humanRecord: buildHumanAuditRecord({ ...partial, decision: elevatedDecision }),
      sourceTrust,
      blastRadius,
      actionIdentity,
      shield,
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

    // Persistence is best-effort: the verification decision above is final and
    // must be returned even if the audit store or Supabase sync fails (e.g. a
    // cold connection right after a deploy). Never let persistence turn a
    // successful verification into a 500.
    try {
      await this.auditStore.append(result)
    } catch (err) {
      console.error('[sanctum] audit store append failed (best-effort, ignored):', err instanceof Error ? err.message : String(err))
    }
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

  simulateAction(
    request: ActionRequest,
    options: { offlineMode?: boolean; policyEngine?: PolicyEngine } = {},
  ) {
    const sourceTrust = deriveSourceTrust(request)
    const blastRadius = estimateBlastRadius(request)
    const actionIdentity = deriveActionIdentity(request)
    const detectedAnomalies = detectAnomalies(request)
    const shield = assessShield(request, {
      anomalyFlags: detectedAnomalies,
      sourceTrust,
      blastRadius,
    })
    const anomalyFlags = [
      ...new Set([...detectedAnomalies, ...shield.signals.map((signal) => signal.id)]),
    ]
    const useHeuristicsOnly = options.offlineMode === true || this.forceOfflineMode
    const engine = options.policyEngine ?? this.policyEngine
    const policyEval = engine.evaluate(request, useHeuristicsOnly)
    const risk = mergeRisk(
      heuristicRiskFloor(request, anomalyFlags),
      riskFromBlastRadius(blastRadius.level),
    )
    let decision = resolveDecision({
      policy: policyEval.policy,
      risk,
      anomalyFlags,
    })
    if (shield.requiredDecision === 'BLOCKED') decision = 'BLOCKED'
    else if (shield.requiredDecision === 'REQUIRE_VERIFICATION' && decision === 'APPROVED') {
      decision = 'REQUIRE_VERIFICATION'
    }
    // Mirror the live fail-safe: simulation runs heuristics-only (no risk model),
    // so an unconfigured action that would otherwise be approved is held for
    // verification — exactly what the runtime would do when the model is offline.
    if (decision === 'APPROVED' && !policyEval.matched) {
      decision = 'REQUIRE_VERIFICATION'
      if (!anomalyFlags.includes('unconfigured_action_unassessed')) {
        anomalyFlags.push('unconfigured_action_unassessed')
      }
    }

    return {
      simulation: true as const,
      decision,
      risk,
      policyPath: policyEval.policyPath,
      anomalyFlags,
      sourceTrust,
      blastRadius,
      actionIdentity,
      shield,
      conditionMatched: policyEval.policyPath.includes('.condition['),
      policyFlags: {
        autoBlock: policyEval.policy.autoBlock,
        requiresVerification: policyEval.policy.requiresVerification,
        blockWhenOffline: policyEval.policy.blockWhenOffline,
        allowedActors: policyEval.policy.allowedActors ?? [],
        conditions: policyEval.policy.conditions ?? [],
      },
    }
  }

  async replayAudit(limit = 100, orgId?: string) {
    const entries = await this.listAudit(limit, orgId)
    const decisions = { APPROVED: 0, BLOCKED: 0, REQUIRE_VERIFICATION: 0 }
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
      const sim = this.simulateAction({
        actor: entry.actor,
        action: entry.action,
        context: entry.context,
      })
      decisions[sim.decision] += 1
      if (sim.decision !== entry.decision || sim.risk !== entry.risk) {
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

  async evidenceSummary(limit = 200, orgId?: string) {
    const audit = await this.listAudit(limit, orgId)
    const policyCount = Object.keys(this.policyEngine.getPolicies()).length
    const approved = audit.filter((e) => e.decision === 'APPROVED').length
    const blocked = audit.filter((e) => e.decision === 'BLOCKED').length
    const verification = audit.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length
    const withToken = audit.filter((e) => e.actionToken).length
    const executed = audit.filter((e) => e.execution).length
    const executionFailed = audit.filter((e) => e.execution?.status === 'failed').length
    const highBlast = audit.filter((e) => e.blastRadius?.level === 'high' || e.blastRadius?.level === 'critical').length
    const untrustedSource = audit.filter((e) =>
      e.sourceTrust === 'untrusted_content' || e.sourceTrust === 'tool_output',
    ).length

    return {
      generatedAt: new Date().toISOString(),
      orgId,
      controls: {
        actionVerification: true,
        signedActionTokens: Boolean(process.env.SANCTUM_ACTION_TOKEN_SECRET || process.env.SANCTUM_API_KEY_PEPPER || process.env.SANCTUM_API_KEY),
        sourceTrustClassification: true,
        blastRadiusScoring: true,
        shieldEarlyWarningContainment: true,
        policyReplay: true,
        humanVerification: true,
        auditTrail: true,
      },
      policyCount,
      auditWindow: {
        sampledEvents: audit.length,
        approved,
        blocked,
        verificationRequired: verification,
        signedApprovalTokens: withToken,
        executionReports: executed,
        failedExecutions: executionFailed,
        highBlastRadiusEvents: highBlast,
        untrustedSourceEvents: untrustedSource,
      },
      evidence: [
        `${policyCount} active policy definitions are loaded.`,
        `${audit.length} recent action events were sampled for this evidence package.`,
        `${blocked} action(s) were blocked and ${verification} action(s) required human verification.`,
        `${executed} approved action(s) reported post-execution status; ${executionFailed} reported failure.`,
        `${highBlast} action(s) carried high or critical blast-radius metadata.`,
        `${untrustedSource} action(s) originated from untrusted content or tool output.`,
        `${audit.filter((e) => e.shield?.level === 'critical').length} action(s) triggered critical Sanctum Shield containment.`,
      ],
    }
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
export { verifyActionToken } from './action-token.js'
export { assessShield } from './shield.js'
export { maybeSyncAuditToSupabase } from './supabase-audit.js'

function riskFromBlastRadius(level: 'low' | 'medium' | 'high' | 'critical'): RiskLevel {
  if (level === 'critical' || level === 'high') return 'high'
  if (level === 'medium') return 'medium'
  return 'low'
}
