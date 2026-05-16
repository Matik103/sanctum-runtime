# @sanctum-runtime/adapter-agent-runtime

`protectAgent()` and `AgentActions` helpers for the Sanctum runtime SDK.

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await protectAgent(sanctum, {
  actor: 'my-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

Requires a running Sanctum API — clone [sanctum-runtime](https://github.com/Matik103/sanctum-runtime) and `npm run dev:runtime`, or point at your hosted API.

MIT — see [OPEN_CORE.md](https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md).
