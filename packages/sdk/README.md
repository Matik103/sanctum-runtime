# @sanctum/runtime

Runtime trust SDK for autonomous AI — verify actions before execution, manage policies, and read audit logs.

Part of the [Sanctum open-core](https://github.com/Matik103/sanctum-runtime) monorepo (MIT).

## Install

```bash
npm install @sanctum/runtime
```

## Quick start

Point at **your** Sanctum API URL (no default host/port in the SDK):

```ts
import { SanctumRuntime } from '@sanctum/runtime'

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL!, // or explicit URL in production
})

const result = await sanctum.verifyAction({
  actor: 'my-agent',
  action: 'unlock_door',
  context: { time: '02:13 AM', owner_sleeping: true },
}, { offlineMode: true })
```

In Node, you can omit `baseUrl` if `SANCTUM_API_URL` is set in the environment.

## Run the API locally

Clone [sanctum-runtime](https://github.com/Matik103/sanctum-runtime), copy `.env.example` → `.env`, configure endpoints, then `npm run dev:runtime`.

## Open core vs enterprise

Fleet orchestration, hosted cloud, and advanced threat intelligence are **enterprise / private** — see [OPEN_CORE.md](https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md).

## License

MIT
