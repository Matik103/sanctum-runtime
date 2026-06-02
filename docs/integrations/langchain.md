# LangChain — verify before tool call

Gate LangChain tools with Sanctum so dangerous actions pause for human review or block automatically.

**Marketplace template:** `langchain-agent-host` — install in dashboard, then `connectFromPackage('langchain-agent-host', orgId)`. Example: `npm run example:marketplace:langchain`.

## Python (recommended)

```bash
pip install sanctum-runtime langchain-core
```

```python
import os
from sanctum_runtime import SanctumRuntime
from langchain_core.tools import tool

runtime = SanctumRuntime()  # SANCTUM_API_URL + SANCTUM_API_KEY from env

@tool
def unlock_door(location: str, intent: str) -> str:
    """Unlock a physical door."""
    result = runtime.verify_action({
        "actor": "langchain-agent",
        "action": "unlock_door",
        "context": {"location": location, "intent": intent},
    })
    if result["decision"] == "REQUIRE_VERIFICATION":
        return f"Paused for operator review (id={result['correlationId']})"
    return f"Door unlocked at {location}"

# Register unlock_door on your agent / tool list as usual
```

Set policy in dashboard: `unlock_door` → **Verify** or **Block**.

## Node.js

```bash
npm install @sanctum-runtime/sdk @langchain/core
```

```typescript
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const runtime = new SanctumRuntime()

export const unlockDoor = tool(
  async ({ location, intent }) => {
    const result = await runtime.verifyAction({
      actor: 'langchain-agent',
      action: 'unlock_door',
      context: { location, intent },
    })
    if (result.decision === 'REQUIRE_VERIFICATION') {
      return `Paused for review: ${result.correlationId}`
    }
    return `Unlocked ${location}`
  },
  {
    name: 'unlock_door',
    description: 'Unlock a door',
    schema: z.object({ location: z.string(), intent: z.string() }),
  },
)
```

## Pattern

1. **One Sanctum action per tool** (or per risky capability).
2. Call `verify_action` **at the start** of the tool handler.
3. On `REQUIRE_VERIFICATION`, return a message to the model — do not call downstream APIs.
4. Operator resolves in the [dashboard](https://console.sanctumruntime.com) or via `wait_for_verification` / CLI.

See [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md) for policies, webhooks, and YAML export.
