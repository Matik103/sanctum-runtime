# MCP tool servers with Sanctum

The Model Context Protocol (MCP) gives LLM clients a clean way to talk to
tools. It also gives untrusted content a clean way to talk to your filesystem,
your terminal, and your secrets. Sanctum is the gate that runs between an
MCP tool dispatch and its handler.

## The threat model

When you wire Claude Desktop (or any MCP-aware client) to an `@modelcontextprotocol/server-filesystem`
or shell-execution server, you've handed the model a real-world execution
surface. The model's instructions came from:

- Your conversation (trusted)
- A web page it read (untrusted)
- A document you opened (untrusted)
- A previous tool result (semi-trusted — could be poisoned)

A jailbreak in any of those can drive the tool. Sanctum doesn't try to
prevent the jailbreak — it makes the *side effect* require a token.

## Install the policy pack

```bash
curl -X POST $SANCTUM_API/v1/marketplace/install \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{ "slug": "mcp-tools-baseline", "orgId": "your-org" }'
```

What it does:

| MCP tool                 | Response          | Rationale                                          |
| ------------------------ | ----------------- | -------------------------------------------------- |
| `execute_shell`          | verify, block offline | high-risk, esp. with tool_output instruction source |
| `delete_file`            | verify            | irreversible                                       |
| `read_credentials`       | **auto-block**    | MCP tools should never read secrets                |
| `install_package`        | verify            | supply-chain risk                                  |
| `send_email`             | verify            | exfiltration / social-engineering vector           |
| `write_file`             | flag              | evaluate for path traversal                        |
| `fetch_url`              | flag              | SSRF / data exfil risk                             |

## Wire it into your MCP server

```ts
import { Server } from '@modelcontextprotocol/sdk/server'
import { wrapMcpTool, createSanctumMcpHook } from '@sanctum-runtime/adapters/mcp'
import { SanctumClient } from '@sanctum-runtime/sdk'

const sanctum = new SanctumClient({ baseUrl: process.env.SANCTUM_API })
const server = new Server({ name: 'my-mcp', version: '1.0.0' }, { capabilities: {} })

// Option A: wrap individual tools
server.tool('execute_shell', shellInputSchema, wrapMcpTool({
  name: 'execute_shell',
  handler: rawShellHandler,
}, { client: sanctum, agentId: 'mcp:shell' }).handler)

// Option B: single hook for the whole server (preferred for many tools)
const hook = createSanctumMcpHook({ client: sanctum, agentId: 'mcp:my-server' })

server.setRequestHandler('tools/call', async (req) => {
  await hook.beforeToolCall(req.params.name, req.params.arguments)
  return realDispatch(req)
})
```

The adapter stamps `instructionSource: tool_output` by default — exactly what
you want for MCP, because any MCP call may have been driven by a previous
tool result the model is now acting on.

## Claude Desktop integration

If you're running Sanctum alongside Claude Desktop's computer-use API, also
install the `claude-desktop-safety` policy pack and use the adapter at
`@sanctum-runtime/adapters/claude-desktop`:

```ts
import { gateClaudeToolUse } from '@sanctum-runtime/adapters/claude-desktop'

for (const block of response.content) {
  if (block.type === 'tool_use') {
    await gateClaudeToolUse(block, { client: sanctum, agentId: 'claude:user' })
    const result = await dispatchTool(block)
    // …feed result back to Claude
  }
}
```

The two packs compose — keychain access, system-setting changes are auto-blocked
absolutely; shell + email + downloads require verification; routine browsing
and calendar reads pass through with a log entry.
