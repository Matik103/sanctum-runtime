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
})

const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: { heard: 'Open the front door', time: '02:13 AM' },
})
// APPROVED | REQUIRE_VERIFICATION | BLOCKED
```

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
