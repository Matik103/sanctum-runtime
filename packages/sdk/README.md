# @sanctum/runtime

Runtime trust SDK for autonomous AI — verify actions before execution, manage policies, and read audit logs.

Part of the [Sanctum open-core](https://github.com/Matik103/sanctum-runtime) monorepo (MIT). Requires a running Sanctum API (`npm run dev:runtime` in the repo, or your own deployment).

## Install

```bash
npm install @sanctum/runtime
```

## Quick start

```ts
import { SanctumRuntime } from '@sanctum/runtime'

const sanctum = new SanctumRuntime({ baseUrl: 'http://127.0.0.1:3001' })

const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: { time: '02:13 AM', owner_sleeping: true },
}, { offlineMode: true })

console.log(result.decision) // REQUIRE_VERIFICATION | APPROVED | BLOCKED
```

## Middleware

```ts
await sanctum.middleware()({
  action: 'send_email',
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

## Open core vs enterprise

This package is **public OSS**. Fleet orchestration, hosted cloud, and advanced threat intelligence are **enterprise / private** — see [OPEN_CORE.md](https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md).

## License

MIT
