from __future__ import annotations

from sanctum_runtime.types import ActionResult


class SanctumApiError(Exception):
  """HTTP or transport error from the Sanctum API."""

  def __init__(self, message: str, status_code: int | None = None) -> None:
    super().__init__(message)
    self.status_code = status_code


class SanctumActionBlockedError(Exception):
  def __init__(self, result: ActionResult) -> None:
    self.result = result
    super().__init__(f"Action blocked: {result.get('action', '?')}")


class SanctumVerificationRequiredError(Exception):
  def __init__(self, result: ActionResult) -> None:
    self.result = result
    super().__init__(
      f"Verification required: {result.get('action', '?')} "
      f"(correlationId={result.get('correlationId', '?')})"
    )
