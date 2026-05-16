# Start here (developers)

**This repository is open source (MIT).** Configure your environment first — hosts and ports are **not** hardcoded in the app.

## 1. Configure

```bash
cp .env.example .env
# Edit .env — set HOST, PORT, DASHBOARD_*, SITE_*, OLLAMA_URL for your machine
```

See [`.env.example`](./.env.example) for every variable.

## 2. Run

```bash
npm install
npm run dev:runtime
npm run smoke
```

Open the dashboard at the URL from your `DASHBOARD_URL` (or `DASHBOARD_HOST` + `DASHBOARD_PORT`).  
Health check: `{SANCTUM_API_URL or http://HOST:PORT}/health`

## What is open source here?

| Path | What it is |
|------|------------|
| [`packages/sdk`](./packages/sdk) | `@sanctum/runtime` — embed in your agent or backend |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | `protectAgent()` — verify before execute |
| [`apps/api`](./apps/api) | Runtime API server |
| [`apps/dashboard`](./apps/dashboard) | Community control plane UI |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy + risk + audit pipeline |
| [`examples/`](./examples/) | Runnable samples |

**Not in this repo (enterprise / private):** fleet orchestration, hosted cloud, proprietary threat intelligence — [OPEN_CORE.md](./OPEN_CORE.md).

## Embed in your project

```ts
import { SanctumRuntime } from '@sanctum/runtime'

// Pass your API URL (from .env SANCTUM_API_URL, or explicit in production)
const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await sanctum.middleware()({
  action: 'send_email',
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

In Node, the SDK also reads `SANCTUM_API_URL` when `baseUrl` is omitted.

## Configuration reference

| Variable | Used by |
|----------|---------|
| `HOST` + `PORT` or `SANCTUM_API_URL` | API, SDK, smoke tests, dashboard proxy |
| `DASHBOARD_HOST` + `DASHBOARD_PORT` or `DASHBOARD_URL` | Dashboard dev server |
| `SITE_HOST` + `SITE_PORT` | Marketing site (`npm run dev`) |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Local risk analysis |

## More

- [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise
- [DEVELOPMENT.md](./DEVELOPMENT.md) — monorepo map
- [CONTRIBUTING.md](./CONTRIBUTING.md)
