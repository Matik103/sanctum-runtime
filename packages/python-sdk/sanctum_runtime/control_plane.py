from __future__ import annotations

import time
from threading import Event, Thread
from typing import Any, Callable

from sanctum_runtime.client import SanctumClient

RuntimeMode = str  # cloud | edge | airgap | hybrid


class ControlPlaneSession:
    def __init__(self, client: SanctumClient) -> None:
        self._client = client
        self.runtime_id: str | None = None
        self.organization_id: str | None = None
        self._stop = Event()
        self._thread: Thread | None = None

    @property
    def connected(self) -> bool:
        return self.runtime_id is not None

    def connect(
        self,
        *,
        runtime_name: str,
        organization_id: str,
        mode: RuntimeMode = "cloud",
        fingerprint: str | None = None,
        metadata: dict[str, Any] | None = None,
        telemetry: dict[str, Any] | None = None,
        active_model: str | None = None,
        current_task: str | None = None,
        heartbeat_interval_ms: int = 30_000,
    ) -> dict[str, Any]:
        result = self._client.request(
            "POST",
            "/v1/runtimes/connect",
            {
                "runtimeName": runtime_name,
                "organizationId": organization_id,
                "mode": mode,
                "fingerprint": fingerprint,
                "metadata": metadata or {},
                "telemetry": telemetry or {},
                "activeModel": active_model,
                "currentTask": current_task,
            },
        )
        self.runtime_id = result["runtimeId"]
        self.organization_id = result["organizationId"]
        self._start_heartbeat(heartbeat_interval_ms, telemetry, active_model, current_task)
        return result

    def _start_heartbeat(
        self,
        interval_ms: int,
        telemetry: dict[str, Any] | None,
        active_model: str | None,
        current_task: str | None,
    ) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)
        self._stop.clear()

        def loop() -> None:
            while not self._stop.wait(interval_ms / 1000.0):
                if not self.runtime_id:
                    continue
                try:
                    self._client.request(
                        "POST",
                        f"/v1/runtimes/{self.runtime_id}/heartbeat",
                        {
                            "telemetry": telemetry,
                            "activeModel": active_model,
                            "currentTask": current_task,
                            "status": "online",
                        },
                    )
                except Exception:
                    pass

        self._thread = Thread(target=loop, daemon=True)
        self._thread.start()

    def disconnect(self) -> None:
        self._stop.set()
        if self.runtime_id:
            try:
                self._client.request(
                    "POST",
                    f"/v1/runtimes/{self.runtime_id}/heartbeat",
                    {"status": "offline"},
                )
            except Exception:
                pass
        self.runtime_id = None
        self.organization_id = None

    def register_agent(
        self,
        *,
        id: str,
        model: str | None = None,
        permissions: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Any:
        if not self.runtime_id:
            raise RuntimeError("Call connect() first")
        return self._client.request(
            "POST",
            f"/v1/runtimes/{self.runtime_id}/agents",
            {"id": id, "model": model, "permissions": permissions or [], "metadata": metadata or {}},
        )

    def emit_event(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        agent_id: str | None = None,
    ) -> Any:
        if not self.runtime_id:
            raise RuntimeError("Call connect() first")
        return self._client.request(
            "POST",
            f"/v1/runtimes/{self.runtime_id}/events",
            {
                "eventType": event_type,
                "payload": payload or {},
                "agentId": agent_id,
                "organizationId": self.organization_id,
            },
        )
