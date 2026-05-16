import { z } from 'zod'

export const ActionRequestSchema = z.object({
  actor: z.string().min(1),
  action: z.string().min(1),
  context: z.record(z.unknown()).default({}),
})

export type ActionRequest = z.infer<typeof ActionRequestSchema>

export const DecisionSchema = z.enum(['APPROVED', 'BLOCKED', 'REQUIRE_VERIFICATION'])
export type Decision = z.infer<typeof DecisionSchema>

export const RiskLevelSchema = z.enum(['low', 'medium', 'high'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const RiskAssessmentSchema = z.object({
  risk: RiskLevelSchema,
  reason: z.string(),
  recommendation: z.enum(['approve', 'block', 'require_verification']),
  confidence: z.number().min(0).max(1).optional(),
})

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>

export const EvaluationModeSchema = z.enum([
  'online_model',
  'offline_forced',
  'offline_no_ollama',
  'offline_model_failed',
])
export type EvaluationMode = z.infer<typeof EvaluationModeSchema>

export const ActionResultSchema = z.object({
  id: z.string(),
  correlationId: z.string(),
  actor: z.string(),
  action: z.string(),
  context: z.record(z.unknown()),
  decision: DecisionSchema,
  risk: RiskLevelSchema,
  reasoning: z.string(),
  policyPath: z.string(),
  modelConfidence: z.number().optional(),
  anomalyFlags: z.array(z.string()),
  timestamp: z.string(),
  /** @deprecated Use evaluationMode — true when heuristics-only path was used */
  offlineMode: z.boolean(),
  evaluationMode: EvaluationModeSchema,
  modelInvoked: z.boolean(),
  ollamaConnected: z.boolean(),
})

export type ActionResult = z.infer<typeof ActionResultSchema>

export const AuditEntrySchema = ActionResultSchema
export type AuditEntry = ActionResult

export const ActionPolicySchema = z.object({
  requiresVerification: z.boolean().default(false),
  autoBlock: z.boolean().default(false),
  blockWhenOffline: z.boolean().default(false),
  allowedActors: z.array(z.string()).optional(),
})

export type ActionPolicy = z.infer<typeof ActionPolicySchema>

export type PolicyMap = Record<string, ActionPolicy>

export const RuntimeStatusSchema = z.object({
  runtimeOnline: z.boolean(),
  ollamaConnected: z.boolean(),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  /** Global: Ollama unreachable or SANCTUM_OFFLINE_MODE=true */
  systemOfflineCapable: z.boolean(),
  policyCount: z.number(),
  auditCount: z.number(),
})

export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>
