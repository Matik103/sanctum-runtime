# @sanctum-runtime/sdk

Runtime trust SDK for autonomous AI — verify actions before execution, manage policies, and read audit logs.

Part of the [Sanctum open-core](https://github.com/Matik103/sanctum-runtime) monorepo (MIT).

**Full capabilities:** [DEVELOPER_GUIDE.md](https://github.com/Matik103/sanctum-runtime/blob/main/DEVELOPER_GUIDE.md)

## Install

```bash
npm install @sanctum-runtime/sdk
# optional agent helper:
npm install @sanctum-runtime/adapter-agent-runtime
```

## Quick start

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL!,
})

const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: { heard: 'Open the door', time: '02:13 AM' },
})
```

## What you can do

| API | Purpose |
|-----|---------|
| `verifyAction()` | Gate one action |
| `policy()` / `registerPolicy()` / `deletePolicy()` | Unlimited action policies |
| `exportPoliciesYaml()` / `importPoliciesYaml()` | Policy-as-code |
| `waitForVerification()` | Resume after dashboard approve |
| `resolveAuditEntry()` | Operator approve/deny |
| `getAudit()` / `getStatus()` | Observability |
| `middleware()` | Express-style agent hook |

Policies support `riskPrompt` (per-action model instructions). Pair with [adapter-agent-runtime](https://github.com/Matik103/sanctum-runtime/tree/main/packages/adapters/agent-runtime) for `protectAgent()` + `awaitVerification`.

## Run the API locally

Clone [sanctum-runtime](https://github.com/Matik103/sanctum-runtime), `cp .env.example .env`, `npm run dev:runtime`, `npm run smoke`.

## Open core vs enterprise

Fleet orchestration, hosted cloud, and advanced threat intelligence are **enterprise / private** — see [OPEN_CORE.md](https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md).

## License

MIT
