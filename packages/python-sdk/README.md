# sanctum-runtime (Python)

Python SDK with **parity** to [`@sanctum-runtime/sdk`](https://www.npmjs.com/package/@sanctum-runtime/sdk).

```bash
pip install sanctum-runtime
```

```python
import os
from sanctum_runtime import SanctumClient, SanctumRuntime

client = SanctumClient(base_url=os.environ["SANCTUM_API_URL"], api_key=os.environ.get("SANCTUM_API_KEY"))
runtime = SanctumRuntime(client)

result = runtime.verify_action({
    "actor": "warehouse-bot",
    "action": "unlock_door",
    "context": {
        "location": "bay-3",
        "intent": "After-hours delivery",
        "sourceTrust": "authenticated_user",
        "toolId": "door-controller.unlock",
        "runtimeId": "warehouse-runtime-1",
        "environmentId": "bay-3-prod",
        "requestedPermission": "door:unlock",
        "scope": ["bay-3"],
        "physicalWorld": True,
        "reversible": False,
    },
})

print(result["decision"], result["reasoning"])
print(result.get("sourceTrust"), result.get("blastRadius"), result.get("actionIdentity"))

if token := result.get("actionToken"):
    # Downstream executors can require this proof before side effects run.
    print(runtime.verify_action_token(token["token"]))
    runtime.report_action_execution(
        result["id"],
        action_token=token["token"],
        status="succeeded",
        reported_by="door-controller",
        result_summary="Door unlocked for bay-3 delivery window",
    )
```

## Environment

| Variable | Purpose |
|----------|---------|
| `SANCTUM_API_URL` | Runtime API base (e.g. `https://sanctum-api-6zgy.onrender.com`) |
| `SANCTUM_API_KEY` | `X-Sanctum-Key` for scripts / CI |

## API surface

`SanctumClient`: `verify_action`, `simulate_action`, `get_audit`, `replay_audit`, `get_evidence_summary`, `verify_action_token`, `get_policies`, `update_policy`, `create_policy`, `delete_policy`, `export_policies_yaml`, `import_policies_yaml`, `get_webhook_status`, `get_status`, `get_verification_status`, `wait_for_verification`, `resolve_audit_entry`.

`SanctumRuntime`: `verify_action` (optional raises), `simulate_action`, `replay_audit`, `get_evidence_summary`, `verify_action_token`, `policy`, `register_policy`, policy YAML helpers.

## Trust pipeline helpers

```python
simulation = runtime.simulate_action({
    "actor": "ci-agent",
    "action": "deploy_service",
    "context": {"sourceTrust": "tool_output", "externalDestination": True},
})

replay = runtime.replay_audit(limit=100)
evidence = runtime.get_evidence_summary(limit=200)
```

Action results may include `sourceTrust`, `blastRadius`, `actionIdentity`, and a short-lived signed `actionToken` when approved. These fields match the TypeScript SDK shape so Python agents can share the same approval proof and audit evidence pipeline.

See [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md) and [docs/integrations](../../docs/integrations/).
