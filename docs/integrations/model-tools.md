# Provider-neutral model tools

Sanctum controls the action boundary, not the model brand. OpenAI, Claude,
Gemini, Grok, DeepSeek, NVIDIA NIM, Bedrock and local model APIs all become
controllable when their named tool calls pass through one executor wrapper.

## 1. Register an agent

In the console, open **Agents**, register an agent, and store the one-time
`SANCTUM_AGENT_TOKEN` value. The token identifies this agent and fixes its
organization scope at the API boundary.

Use an API key from **Devices & API Keys** when the same process also registers
a runtime host, runs fleet automation, or performs administrative operations.

## 2. Wrap tool execution

```ts
import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapModelToolExecutor } from '@sanctum-runtime/adapters/model-tools'

const client = new SanctumClient({
  baseUrl: process.env.SANCTUM_API_URL!,
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
})

const executeSafely = wrapModelToolExecutor(executeRealTool, {
  client,
  provider: 'google-gemini', // openai | anthropic | xai-grok | deepseek | nvidia-nim | custom ...
  model: 'gemini-2.5-pro',
  agentId: 'support-agent',
  enforceActionToken: true,
})

for (const call of modelResponse.toolCalls) {
  const result = await executeSafely({
    name: call.name,
    arguments: call.arguments,
    callId: call.id,
  })
  // Return result to the model only after approved execution.
}
```

Set `instructionSource: 'webpage'`, `'email'`, `'tool_output'`, or `'memory'`
when a retrieved source influenced a call. Source-trust policies can then stop
indirect prompt injection at execution time.

## 3. Operate from the console

The connected action stream appears in Runtime Activity and Audit Logs.
Verification requests arrive in the review queue and mobile push notifications,
and the same policy packs apply regardless of the upstream model provider.

## Boundary

This integration cannot passively observe a personal ChatGPT, Claude, Gemini,
Grok or other consumer chat account. The agent, MCP server, automation or tool
gateway must route proposed actions through Sanctum before side effects run.
