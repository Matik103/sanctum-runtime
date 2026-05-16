# MCP — verify before tool execution

For [Model Context Protocol](https://modelcontextprotocol.io) servers, call Sanctum in each **tool handler** before side effects.

## Python MCP server

```bash
pip install sanctum-runtime mcp
```

```python
import os
from sanctum_runtime import SanctumRuntime, SanctumActionBlockedError
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("sanctum-gated-tools")
runtime = SanctumRuntime()

@mcp.tool()
def transfer_funds(amount: float, to_account: str) -> str:
    result = runtime.verify_action({
        "actor": os.environ.get("MCP_SERVER_ID", "mcp-server"),
        "action": "transfer_funds",
        "context": {"amount": amount, "to_account": to_account},
    })
    if result["decision"] == "BLOCKED":
        raise SanctumActionBlockedError(result)
    if result["decision"] == "REQUIRE_VERIFICATION":
        return f"Blocked pending review: {result['correlationId']}"
  # ... execute transfer ...
    return f"Transferred {amount} to {to_account}"
```

## Node MCP server

```typescript
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const runtime = new SanctumRuntime()

// Inside your MCP tools/call handler:
async function handleUnlockDoor(args: { location: string }) {
  const result = await runtime.verifyAction({
    actor: 'mcp-host',
    action: 'unlock_door',
    context: args,
  })
  if (result.decision !== 'APPROVED') {
    return {
      content: [{ type: 'text', text: `Sanctum: ${result.decision} — ${result.reasoning}` }],
      isError: true,
    }
  }
  // ... real unlock ...
}
```

## Design notes

- Map **one MCP tool name → one Sanctum action** for clear policies.
- Return MCP errors (not thrown stack traces) when blocked so the model can explain to the user.
- Use webhooks (`verification.required`) to ping Slack/PagerDuty when hosted — see [DEVELOPER_GUIDE.md](../../DEVELOPER_GUIDE.md).
