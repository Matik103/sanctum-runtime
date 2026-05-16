# Start here (developers)

**This repository is open source (MIT).** Everything needed to run and embed Sanctum’s public runtime is in this repo.

## 60-second start

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
npm install
npm run dev:runtime   # API :3001 · dashboard :5174
npm run smoke
```

Open **http://localhost:5174** (dashboard) or call **http://127.0.0.1:3001/health** (API).

## What is open source here?

| Path | What it is |
|------|------------|
| [`packages/sdk`](./packages/sdk) | `@sanctum/runtime` — embed in your agent or backend |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | `protectAgent()` — verify before execute |
| [`apps/api`](./apps/api) | Runtime API server |
| [`apps/dashboard`](./apps/dashboard) | Community control plane UI |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy + risk + audit pipeline |
| [`examples/`](./examples/) | Runnable samples |
| [`src/routes/docs.tsx`](./src/routes/docs.tsx) | Public docs (also at `/docs` on the marketing site) |

**Not in this repo (enterprise / private, later):** fleet orchestration, hosted Sanctum Cloud, proprietary threat intelligence. See [OPEN_CORE.md](./OPEN_CORE.md).

## Embed in your project

```ts
import { SanctumRuntime } from '@sanctum/runtime'

const sanctum = new SanctumRuntime({ baseUrl: 'http://127.0.0.1:3001' })

await sanctum.middleware()({
  action: 'send_email',
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

## More

- [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise boundary
- [DEVELOPMENT.md](./DEVELOPMENT.md) — contributor / monorepo map
- [CONTRIBUTING.md](./CONTRIBUTING.md) — issues and PRs
- [LICENSE](./LICENSE) — MIT
