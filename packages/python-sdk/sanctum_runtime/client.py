from __future__ import annotations

import os
import time
from typing import Any, Callable, Literal
from urllib.parse import urlencode

import httpx

from sanctum_runtime.errors import SanctumApiError
from sanctum_runtime.types import (
    ActionPolicy,
    ActionRequest,
    ActionResult,
    ActionTokenVerification,
    AuditReplayResult,
    EvidenceSummary,
    PolicyMap,
    RuntimeStatus,
    SimulateResult,
    VerificationStatus,
)

ResolveDecision = Literal["APPROVED", "BLOCKED"]


class SanctumClient:
  """HTTP client for Sanctum Runtime API — mirrors @sanctum-runtime/sdk SanctumClient."""

  def __init__(
    self,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
    offline_mode: bool = False,
    get_access_token: Callable[[], str | None] | Callable[[], str | None | Any] | None = None,
    timeout: float = 60.0,
  ) -> None:
    base = base_url or os.environ.get("SANCTUM_API_URL")
    if not base:
      raise ValueError(
        "SanctumClient requires base_url or SANCTUM_API_URL in the environment."
      )
    self._base = base.rstrip("/")
    self._api_key = api_key or os.environ.get("SANCTUM_API_KEY")
    self._offline_mode = offline_mode
    self._get_access_token = get_access_token
    self._timeout = timeout

  def _headers(self, json_body: bool = True) -> dict[str, str]:
    headers: dict[str, str] = {}
    if json_body:
      headers["Content-Type"] = "application/json"
    token = None
    if self._get_access_token:
      token = self._get_access_token()
      if callable(getattr(token, "__await__", None)):
        raise TypeError("Use sync get_access_token; async tokens are not supported yet.")
    if token:
      headers["Authorization"] = f"Bearer {token}"
    elif self._api_key:
      headers["X-Sanctum-Key"] = self._api_key
    return headers

  def request(
    self,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    text_response: bool = False,
  ) -> Any:
    return self._request(method, path, json=body, text_response=text_response)

  def _request(
    self,
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    text_response: bool = False,
  ) -> Any:
    url = f"{self._base}{path}"
    try:
      with httpx.Client(timeout=self._timeout) as client:
        res = client.request(method, url, headers=self._headers(json is not None), json=json)
    except httpx.RequestError as e:
      raise SanctumApiError(f"Network error: {e}") from e

    if res.status_code >= 400:
      raise SanctumApiError(
        f"Sanctum API {method} {path} failed: {res.status_code} {res.text}",
        status_code=res.status_code,
      )
    if text_response:
      return res.text
    if res.status_code == 204 or not res.content:
      return None
    return res.json()

  def verify_action(
    self,
    request: ActionRequest,
    *,
    offline_mode: bool | None = None,
    correlation_id: str | None = None,
  ) -> ActionResult:
    body: dict[str, Any] = {
      **request,
      "context": request.get("context") or {},
      "offlineMode": offline_mode if offline_mode is not None else self._offline_mode,
    }
    if correlation_id:
      body["correlationId"] = correlation_id
    return self._request("POST", "/v1/actions/verify", json=body)

  @staticmethod
  def _query(params: dict[str, str | int | None]) -> str:
    clean = {key: value for key, value in params.items() if value is not None}
    return f"?{urlencode(clean)}" if clean else ""

  def get_audit(self, limit: int = 50, org_id: str | None = None) -> list[ActionResult]:
    return self._request("GET", f"/v1/audit{self._query({'limit': limit, 'org_id': org_id})}")

  def simulate_action(
    self,
    request: ActionRequest,
    *,
    offline_mode: bool | None = None,
  ) -> SimulateResult:
    body: dict[str, Any] = {
      **request,
      "context": request.get("context") or {},
    }
    if offline_mode is not None:
      body["offlineMode"] = offline_mode
    return self._request("POST", "/v1/policies/simulate", json=body)

  def replay_audit(self, limit: int = 100, org_id: str | None = None) -> AuditReplayResult:
    return self._request("GET", f"/v1/audit/replay{self._query({'limit': limit, 'org_id': org_id})}")

  def get_evidence_summary(self, limit: int = 200, org_id: str | None = None) -> EvidenceSummary:
    return self._request("GET", f"/v1/evidence/summary{self._query({'limit': limit, 'org_id': org_id})}")

  def verify_action_token(self, token: str) -> ActionTokenVerification:
    return self._request("POST", "/v1/actions/token/verify", json={"token": token})

  def get_policies(self) -> PolicyMap:
    return self._request("GET", "/v1/policies")

  def update_policy(self, action: str, patch: ActionPolicy) -> PolicyMap:
    return self._request("PATCH", f"/v1/policies/{action}", json=patch)

  def create_policy(self, action: str, patch: ActionPolicy | None = None) -> PolicyMap:
    body: dict[str, Any] = {"action": action, **(patch or {})}
    return self._request("POST", "/v1/policies", json=body)

  def delete_policy(self, action: str) -> PolicyMap:
    return self._request("DELETE", f"/v1/policies/{action}")

  def export_policies_yaml(self) -> str:
    return self._request("GET", "/v1/policies/export.yaml", text_response=True)

  def import_policies_yaml(self, yaml: str, merge: bool = True) -> PolicyMap:
    return self._request("POST", "/v1/policies/import.yaml", json={"yaml": yaml, "merge": merge})

  def get_webhook_status(self) -> dict[str, Any]:
    return self._request("GET", "/v1/webhooks/status")

  def get_status(self) -> RuntimeStatus:
    return self._request("GET", "/v1/status")

  def get_verification_status(self, correlation_id: str) -> VerificationStatus:
    return self._request("GET", f"/v1/verifications/{correlation_id}")

  def wait_for_verification(
    self,
    correlation_id: str,
    *,
    timeout_ms: int = 120_000,
    poll_interval_ms: int = 2_000,
  ) -> VerificationStatus:
    deadline = time.monotonic() + timeout_ms / 1000.0
    while time.monotonic() < deadline:
      status = self.get_verification_status(correlation_id)
      s = status.get("status")
      if s in ("approved", "blocked"):
        return status
      if s == "not_found":
        raise SanctumApiError(f"No audit entry for correlationId {correlation_id}")
      time.sleep(poll_interval_ms / 1000.0)
    raise SanctumApiError(f"Verification timed out after {timeout_ms}ms ({correlation_id})")

  def resolve_audit_entry(
    self,
    entry_id: str,
    *,
    decision: ResolveDecision,
    resolved_by: str | None = None,
    note: str | None = None,
  ) -> ActionResult:
    body: dict[str, Any] = {"decision": decision}
    if resolved_by:
      body["resolvedBy"] = resolved_by
    if note:
      body["note"] = note
    return self._request("POST", f"/v1/audit/{entry_id}/resolve", json=body)
