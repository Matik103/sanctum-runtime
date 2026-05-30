# @sanctum-runtime/connect

Gate **local tool execution** for Connect Agent without installing the full SDK.

## Setup

1. Route chat completions through the Connect proxy (`base_url` + `X-Sanctum-Agent-Token`).
2. Wrap local tool handlers with this package before running side effects.

```ts
import { ConnectClient, runGatedToolCalls } from '@sanctum-runtime/connect'

const connect = new ConnectClient({
  apiUrl: 'https://api.sanctumruntime.com',
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
  platform: 'openai',
})

// Single tool
await connect.verifyExecution('send_email', { to: 'ops@acme.com' }, 'call_abc')

// OpenAI tool_calls batch
await runGatedToolCalls(response.choices[0].message.tool_calls, executors, {
  apiUrl: '...',
  agentToken: '...',
})
```

## LangChain

```ts
import { createSanctumTools } from '@sanctum-runtime/connect/langchain'

const tools = createSanctumTools([searchTool, emailTool], {
  apiUrl: process.env.SANCTUM_API_URL!,
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
})
```

## MCP

```ts
import { createConnectMcpHook } from '@sanctum-runtime/connect/mcp'

const hook = createConnectMcpHook({ apiUrl, agentToken })
await hook.beforeToolCall('read_file', { path: '/tmp/x' })
```

See [docs/CONNECT_AGENT.md](../../docs/CONNECT_AGENT.md) for the full Connect guide.
