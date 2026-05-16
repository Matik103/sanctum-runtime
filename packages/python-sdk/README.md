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
    "context": {"location": "bay-3", "intent": "After-hours delivery"},
})

print(result["decision"], result["reasoning"])
```

## Environment

| Variable | Purpose |
|----------|---------|
| `SANCTUM_API_URL` | Runtime API base (e.g. `https://sanctum-api-6zgy.onrender.com`) |
| `SANCTUM_API_KEY` | `X-Sanctum-Key` for scripts / CI |

## API surface

`SanctumClient`: `verify_action`, `get_audit`, `get_policies`, `update_policy`, `create_policy`, `delete_policy`, `export_policies_yaml`, `import_policies_yaml`, `get_webhook_status`, `get_status`, `get_verification_status`, `wait_for_verification`, `resolve_audit_entry`.

`SanctumRuntime`: `verify_action` (optional raises), `policy`, `register_policy`, policy YAML helpers.

See [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md) and [docs/integrations](../../docs/integrations/).
