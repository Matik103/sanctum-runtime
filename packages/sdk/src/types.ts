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

export const SourceTrustSchema = z.enum([
  'trusted_user',
  'authenticated_user',
  'system',
  'tool_output',
  'memory',
  'untrusted_content',
  'unknown',
])
export type SourceTrust = z.infer<typeof SourceTrustSchema>

export const BlastRadiusSchema = z.object({
  level: z.enum(['low', 'medium', 'high', 'critical']),
  score: z.number().min(0).max(100),
  factors: z.array(z.string()),
  reversible: z.boolean(),
  dataSensitivity: z.enum(['public', 'internal', 'confidential', 'secret', 'regulated']).optional(),
  externalDestination: z.boolean().optional(),
  physicalWorld: z.boolean().optional(),
  estimatedValue: z.number().optional(),
})
export type BlastRadius = z.infer<typeof BlastRadiusSchema>

export const ActionTokenSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  scope: z.object({
    actor: z.string(),
    action: z.string(),
    orgId: z.string().optional(),
    auditId: z.string(),
    correlationId: z.string(),
  }),
})
export type ActionToken = z.infer<typeof ActionTokenSchema>

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
  /** Plain-language audit record (Humans-style compliance log). */
  humanRecord: z.string().optional(),
  /** Operator decision after REQUIRE_VERIFICATION (e.g. "Approved by operator"). */
  humanResolution: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  sourceTrust: SourceTrustSchema.optional(),
  blastRadius: BlastRadiusSchema.optional(),
  /**
   * Short-lived signed proof that this exact action was approved.
   * Downstream executors can validate it before performing side effects.
   */
  actionToken: ActionTokenSchema.optional(),
})

export type ActionResult = z.infer<typeof ActionResultSchema>

export const AuditEntrySchema = ActionResultSchema
export type AuditEntry = ActionResult

export const PolicyConditionSchema = z.object({
  field: z.string(),  // 'actor', 'action', 'context.amount', 'context.path', etc.
  op: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'contains', 'startsWith', 'endsWith', 'matches']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  result: z.enum(['block', 'verify', 'approve']),
})
export type PolicyCondition = z.infer<typeof PolicyConditionSchema>

export const ActionPolicySchema = z.object({
  requiresVerification: z.boolean().default(false),
  autoBlock: z.boolean().default(false),
  blockWhenOffline: z.boolean().default(false),
  allowedActors: z.array(z.string()).optional(),
  /** Custom instructions for the risk model when scoring this action (OSS). */
  riskPrompt: z.string().max(8000).optional(),
  conditions: z.array(PolicyConditionSchema).optional(),
})

export type ActionPolicy = z.infer<typeof ActionPolicySchema>

export type PolicyMap = Record<string, ActionPolicy>

export const RuntimeStatusSchema = z.object({
  runtimeOnline: z.boolean(),
  /** True when an Ollama-backed risk model is connected (legacy field). */
  ollamaConnected: z.boolean(),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  riskProvider: z.enum(['ollama', 'openai', 'none']).optional(),
  riskModel: z.string().optional(),
  riskModelConnected: z.boolean().optional(),
  riskEndpoint: z.string().optional(),
  /** Global: risk model unreachable or SANCTUM_OFFLINE_MODE=true */
  systemOfflineCapable: z.boolean(),
  policyCount: z.number(),
  auditCount: z.number(),
  supabaseConfigured: z.boolean().optional(),
})

export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>
