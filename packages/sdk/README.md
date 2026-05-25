# @sanctum-runtime/sdk

**Gate AI agent actions before they execute.**  
Verify tool calls, API requests, and automations with policies, optional human approval, and audit logs — built for teams shipping **LLM agents**, **tool use**, and **autonomous workflows**.

Part of [Sanctum Runtime](https://github.com/Matik103/sanctum-runtime) (MIT open core).

📖 **Full capabilities:** [DEVELOPER_GUIDE.md](https://github.com/Matik103/sanctum-runtime/blob/main/DEVELOPER_GUIDE.md)

## Install

```bash
npm install @sanctum-runtime/sdk
# optional verify-before-execute helper:
npm install @sanctum-runtime/adapter-agent-runtime
```

## Quick start

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL!, // your Sanctum API
  agentToken: process.env.SANCTUM_AGENT_TOKEN, // Console > Agents (recommended for one agent)
})

const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: { heard: 'Open the front door', time: '02:13 AM' },
})
// APPROVED | REQUIRE_VERIFICATION | BLOCKED
```

`agentToken` is the signed identity returned when an operator registers an
agent in the console. Use `apiKey` instead for runtime hosts, administrative
pipelines, or fleet-level integrations. If a process supplies both, action
verification uses the agent token while control-plane requests keep the
workspace API key.

## What you can do

| API | Purpose |
|-----|---------|
| `verifyAction()` | Gate one action (tool call, API, command) |
| `policy()` / `registerPolicy()` | Unlimited action policies |
| `exportPoliciesYaml()` / `importPoliciesYaml()` | Policy-as-code |
| `waitForVerification()` | Resume after human approve |
| `middleware()` | Drop-in agent middleware |
| `getAudit()` | Compliance-style audit trail |

Use **`riskPrompt`** per action for custom LLM scoring instructions. Works with **Ollama**, **OpenAI-compatible** APIs, or heuristics-only.

## Easy Connect for model tools

Model providers differ in API shape, but their risky boundary is the same:
before executing a named tool/function call. The provider-neutral adapter
supports OpenAI, Anthropic/Claude, Google Gemini, xAI Grok, DeepSeek, NVIDIA
NIM, Bedrock, local and compatible models:

```ts
import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapModelToolExecutor } from '@sanctum-runtime/adapters/model-tools'

const client = new SanctumClient({
  baseUrl: process.env.SANCTUM_API_URL!,
  agentToken: process.env.SANCTUM_AGENT_TOKEN!,
})

const runTool = wrapModelToolExecutor(executeTool, {
  client,
  provider: 'google-gemini',
  agentId: 'support-agent',
})

await runTool({ name: call.name, arguments: call.arguments })
```

Sanctum gates connected action/tool execution. It does not passively monitor a
consumer ChatGPT, Claude, Gemini or other account that has not connected a tool
boundary.

## Run the API locally

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime && cp .env.example .env
npm install && npm run dev:runtime && npm run smoke
```

## Keywords

AI agents · LLM security · tool use · function calling · guardrails · human-in-the-loop · policy engine · Ollama · agent middleware · audit log · TypeScript

## License

MIT — enterprise fleet/cloud features are separate; see [OPEN_CORE.md](https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md).
