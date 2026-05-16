# Sanctum Runtime

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/github/stars/Matik103/sanctum-runtime?style=social)](https://github.com/Matik103/sanctum-runtime)

**Open-source (MIT) runtime trust infrastructure for autonomous AI systems** — a layer developers install into agents, backends, and robotics stacks.

> **Developers:** [START_HERE.md](./START_HERE.md) — copy `.env.example` → `.env`, set your hosts/ports, then run.  
> **Scope:** [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise.

## Quick start

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
cp .env.example .env    # required — configure your hosts and ports
npm install
npm run dev:runtime
npm run smoke
npm run example:agent
```

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from "@sanctum-runtime/sdk";
import { protectAgent, AgentActions } from "@sanctum-runtime/adapter-agent-runtime";

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL!, // from your .env
});

await protectAgent(sanctum, {
  actor: "my-agent",
  action: AgentActions.SEND_EMAIL,
  context: { to: "user@example.com" },
  offlineMode: true,
  execute: async () => sendEmail(),
});
```

Marketing site + docs: configure `SITE_HOST` / `SITE_PORT` in `.env`, then `npm run dev` → `/docs`

## Configuration

All endpoints are set in **`.env`** (see [`.env.example`](./.env.example)). Nothing assumes a fixed IP or port in application code.

| Variable | Purpose |
|----------|---------|
| `HOST` + `PORT` or `SANCTUM_API_URL` | Runtime API |
| `DASHBOARD_HOST` + `DASHBOARD_PORT` or `DASHBOARD_URL` | Community dashboard |
| `SITE_HOST` + `SITE_PORT` | Marketing / docs site |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Local risk model |

## Open-source map

| Package / app | Purpose |
|---------------|---------|
| [`packages/sdk`](./packages/sdk) | `@sanctum-runtime/sdk` SDK |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | Agent adapter |
| [`apps/api`](./apps/api) | HTTP API |
| [`apps/dashboard`](./apps/dashboard) | Community dashboard |
| [`examples/`](./examples/) | Samples |

Enterprise features (fleet, cloud, advanced intel) are **not** in this repo — [OPEN_CORE.md](./OPEN_CORE.md).

## Docs

| Doc | Use when |
|-----|----------|
| [START_HERE.md](./START_HERE.md) | First run |
| [`.env.example`](./.env.example) | All env vars |
| [OPEN_CORE.md](./OPEN_CORE.md) | OSS vs enterprise |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Monorepo / local AI |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Issues and PRs |

## License

[MIT](./LICENSE)
