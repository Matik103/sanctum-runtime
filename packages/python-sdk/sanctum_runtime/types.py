"""Typed dicts aligned with @sanctum-runtime/sdk public types."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

Decision = Literal["APPROVED", "BLOCKED", "REQUIRE_VERIFICATION"]
RiskLevel = Literal["low", "medium", "high"]
EvaluationMode = Literal[
    "online_model",
    "offline_forced",
    "offline_no_ollama",
    "offline_model_failed",
]
PolicyMode = Literal["approve", "verify", "block"]


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


PolicyMap = dict[str, ActionPolicy]


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
