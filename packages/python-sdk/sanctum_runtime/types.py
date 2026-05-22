"""Typed dicts aligned with @sanctum-runtime/sdk public types."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

Decision = Literal["APPROVED", "BLOCKED", "REQUIRE_VERIFICATION"]
RiskLevel = Literal["low", "medium", "high"]
BlastRadiusLevel = Literal["low", "medium", "high", "critical"]
EvaluationMode = Literal[
    "online_model",
    "offline_forced",
    "offline_no_ollama",
    "offline_model_failed",
]
PolicyMode = Literal["approve", "verify", "block"]
SourceTrust = Literal[
    "trusted_user",
    "authenticated_user",
    "system",
    "tool_output",
    "memory",
    "untrusted_content",
    "unknown",
]
PolicyConditionOp = Literal[
    "gt",
    "lt",
    "gte",
    "lte",
    "eq",
    "neq",
    "contains",
    "startsWith",
    "endsWith",
    "matches",
]
PolicyConditionResult = Literal["block", "verify", "approve"]


class PolicyCondition(TypedDict):
    field: str
    op: PolicyConditionOp
    value: str | int | float | bool
    result: PolicyConditionResult


class ActionRequest(TypedDict):
    actor: str
    action: str
    context: NotRequired[dict[str, Any]]


class ActionPolicy(TypedDict, total=False):
    requiresVerification: bool
    autoBlock: bool
    blockWhenOffline: bool
    allowedActors: list[str]
    riskPrompt: str
    conditions: list[PolicyCondition]


PolicyMap = dict[str, ActionPolicy]


class BlastRadius(TypedDict, total=False):
    level: BlastRadiusLevel
    score: int | float
    factors: list[str]
    reversible: bool
    dataSensitivity: Literal["public", "internal", "confidential", "secret", "regulated"]
    externalDestination: bool
    physicalWorld: bool
    estimatedValue: int | float


class ActionTokenScope(TypedDict, total=False):
    actor: str
    action: str
    orgId: str
    auditId: str
    correlationId: str


class ActionToken(TypedDict, total=False):
    token: str
    expiresAt: str
    scope: ActionTokenScope


class ActionResult(TypedDict, total=False):
    id: str
    correlationId: str
    actor: str
    action: str
    context: dict[str, Any]
    decision: Decision
    risk: RiskLevel
    reasoning: str
    policyPath: str
    modelConfidence: float
    anomalyFlags: list[str]
    timestamp: str
    offlineMode: bool
    evaluationMode: EvaluationMode
    modelInvoked: bool
    ollamaConnected: bool
    humanRecord: str
    humanResolution: str
    resolvedAt: str
    resolvedBy: str
    sourceTrust: SourceTrust
    blastRadius: BlastRadius
    actionToken: ActionToken


class SimulatePolicyFlags(TypedDict, total=False):
    autoBlock: bool
    requiresVerification: bool
    blockWhenOffline: bool
    allowedActors: list[str]
    conditions: list[PolicyCondition]


class SimulateResult(TypedDict, total=False):
    simulation: bool
    decision: Decision
    risk: RiskLevel
    policyPath: str
    anomalyFlags: list[str]
    sourceTrust: SourceTrust
    blastRadius: BlastRadius
    conditionMatched: bool
    policyFlags: SimulatePolicyFlags


class AuditReplayChange(TypedDict, total=False):
    id: str
    actor: str
    action: str
    previousDecision: Decision
    replayDecision: Decision
    previousRisk: RiskLevel
    replayRisk: RiskLevel
    policyPath: str
    anomalyFlags: list[str]


class AuditReplayResult(TypedDict, total=False):
    replayedAt: str
    count: int
    decisions: dict[Decision, int]
    changedCount: int
    changed: list[AuditReplayChange]


class EvidenceAuditWindow(TypedDict, total=False):
    sampledEvents: int
    approved: int
    blocked: int
    verificationRequired: int
    signedApprovalTokens: int
    highBlastRadiusEvents: int
    untrustedSourceEvents: int


class EvidenceSummary(TypedDict, total=False):
    generatedAt: str
    orgId: str
    controls: dict[str, bool]
    policyCount: int
    auditWindow: EvidenceAuditWindow
    evidence: list[str]


class ActionTokenVerification(TypedDict, total=False):
    valid: bool
    payload: dict[str, Any]
    error: str


class RuntimeStatus(TypedDict, total=False):
    runtimeOnline: bool
    ollamaConnected: bool
    ollamaUrl: str
    ollamaModel: str
    riskProvider: Literal["ollama", "openai", "none"]
    riskModel: str
    riskModelConnected: bool
    riskEndpoint: str
    systemOfflineCapable: bool
    policyCount: int
    auditCount: int
    supabaseConfigured: bool


class VerificationStatus(TypedDict, total=False):
    correlationId: str
    status: Literal["pending", "approved", "blocked", "not_found"]
    decision: Decision
    auditEntryId: str
