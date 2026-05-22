from __future__ import annotations

from typing import Literal

from sanctum_runtime.client import SanctumClient
from sanctum_runtime.control_plane import ControlPlaneSession
from sanctum_runtime.errors import (
  SanctumActionBlockedError,
  SanctumApiError,
  SanctumVerificationRequiredError,
)
from sanctum_runtime.types import (
  ActionPolicy,
  ActionRequest,
  ActionResult,
  ActionTokenVerification,
  AuditReplayResult,
  EvidenceSummary,
  ExecutionStatus,
  PolicyMap,
  PolicyMode,
  SimulateResult,
)

PolicyMode = Literal["approve", "verify", "block"]


def _mode_to_policy(mode: PolicyMode) -> ActionPolicy:
  if mode == "approve":
    return {"requiresVerification": False, "autoBlock": False}
  if mode == "verify":
    return {"requiresVerification": True, "autoBlock": False}
  return {"requiresVerification": False, "autoBlock": True}


class SanctumRuntime:
  """High-level wrapper — mirrors SanctumRuntime in the Node SDK."""

  def __init__(self, client: SanctumClient | None = None, **client_kwargs: object) -> None:
    self._client = client or SanctumClient(**client_kwargs)  # type: ignore[arg-type]
    self.control = ControlPlaneSession(self._client)

  def connect(self, **kwargs: object) -> dict:
    return self.control.connect(**kwargs)  # type: ignore[arg-type]

  def disconnect(self) -> None:
    self.control.disconnect()

  def register_agent(self, **kwargs: object) -> object:
    return self.control.register_agent(**kwargs)  # type: ignore[arg-type]

  def emit_event(self, event_type: str, payload: dict | None = None, *, agent_id: str | None = None) -> object:
    return self.control.emit_event(event_type, payload, agent_id=agent_id)

  @property
  def client(self) -> SanctumClient:
    return self._client

  def verify_action(
    self,
    request: ActionRequest,
    *,
    raise_on_block: bool = True,
    raise_on_verify: bool = False,
    **kwargs: object,
  ) -> ActionResult:
    result = self._client.verify_action(request, **kwargs)  # type: ignore[arg-type]
    decision = result.get("decision")
    if self.control.connected:
      event_type = (
        "policy.blocked"
        if decision == "BLOCKED"
        else "policy.verification_required"
        if decision == "REQUIRE_VERIFICATION"
        else "policy.approved"
      )
      self.control.emit_event(
        event_type,
        {
          "action": request.get("action"),
          "decision": decision,
          "correlationId": result.get("correlationId"),
        },
        agent_id=request.get("actor"),
      )
    if raise_on_block and decision == "BLOCKED":
      raise SanctumActionBlockedError(result)
    if raise_on_verify and decision == "REQUIRE_VERIFICATION":
      raise SanctumVerificationRequiredError(result)
    return result

  def get_policies(self) -> PolicyMap:
    return self._client.get_policies()

  def get_status(self):
    return self._client.get_status()

  def get_audit(self, limit: int = 50, org_id: str | None = None) -> list[ActionResult]:
    return self._client.get_audit(limit, org_id=org_id)

  def simulate_action(
    self,
    request: ActionRequest,
    *,
    offline_mode: bool | None = None,
  ) -> SimulateResult:
    return self._client.simulate_action(request, offline_mode=offline_mode)

  def replay_audit(self, limit: int = 100, org_id: str | None = None) -> AuditReplayResult:
    return self._client.replay_audit(limit, org_id=org_id)

  def get_evidence_summary(self, limit: int = 200, org_id: str | None = None) -> EvidenceSummary:
    return self._client.get_evidence_summary(limit, org_id=org_id)

  def verify_action_token(self, token: str) -> ActionTokenVerification:
    return self._client.verify_action_token(token)

  def report_action_execution(
    self,
    entry_id: str,
    *,
    action_token: str,
    status: ExecutionStatus,
    reported_by: str | None = None,
    result_summary: str | None = None,
    output_ref: str | None = None,
    error: str | None = None,
    duration_ms: int | float | None = None,
  ) -> ActionResult:
    return self._client.report_action_execution(
      entry_id,
      action_token=action_token,
      status=status,
      reported_by=reported_by,
      result_summary=result_summary,
      output_ref=output_ref,
      error=error,
      duration_ms=duration_ms,
    )

  def policy(self, action: str, mode: PolicyMode) -> PolicyMap:
    return self._client.update_policy(action, _mode_to_policy(mode))

  def register_policy(self, action: str, mode: PolicyMode | ActionPolicy) -> PolicyMap:
    patch = _mode_to_policy(mode) if isinstance(mode, str) else mode
    try:
      return self._client.update_policy(action, patch)
    except SanctumApiError as e:
      if e.status_code == 404:
        return self._client.create_policy(action, patch)
      raise

  def delete_policy(self, action: str) -> PolicyMap:
    return self._client.delete_policy(action)

  def export_policies_yaml(self) -> str:
    return self._client.export_policies_yaml()

  def import_policies_yaml(self, yaml: str, merge: bool = True) -> PolicyMap:
    return self._client.import_policies_yaml(yaml, merge=merge)
