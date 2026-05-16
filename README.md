# Sanctum Runtime

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/github/stars/Matik103/sanctum-runtime?style=social)](https://github.com/Matik103/sanctum-runtime)

**Open-source (MIT) runtime trust infrastructure for autonomous AI systems** — a layer developers install into agents, backends, and robotics stacks.

> **Developers:** start with **[START_HERE.md](./START_HERE.md)** → clone, run, embed the SDK.  
> **Scope:** what's public vs enterprise → **[OPEN_CORE.md](./OPEN_CORE.md)**

## Quick start

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
npm install
npm run dev:runtime   # API http://127.0.0.1:3001 · dashboard http://127.0.0.1:5174
npm run smoke         # health + SDK checks
npm run example:agent # verify → execute demo
```

```ts
import { SanctumRuntime } from "@sanctum/runtime";

const sanctum = new SanctumRuntime({ baseUrl: "http://127.0.0.1:3001" });

await sanctum.middleware()({
  action: "send_email",
  context: { to: "user@example.com" },
  offlineMode: true,
  execute: async () => sendEmail(),
});
```

Marketing site + docs locally: `npm run dev` → http://localhost:8080/docs

## Open-source map (this repo)

Everything below is **public MIT code** in this repository:

| Package / app | npm / path | Purpose |
|---------------|------------|---------|
| **SDK** | `@sanctum/runtime` · [`packages/sdk`](./packages/sdk) | Verify, policies, middleware |
| **Agent adapter** | [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | `protectAgent()` |
| **Runtime API** | [`apps/api`](./apps/api) | HTTP verify / audit / policies |
| **Dashboard** | [`apps/dashboard`](./apps/dashboard) | Community control plane |
| **Engine** | [`packages/runtime-engine`](./packages/runtime-engine) | Intercept → policy → risk → audit |
| **Examples** | [`examples/`](./examples/) | Runnable agent-gate sample |

**Not in this repo** (enterprise / private, separate repos later): fleet orchestration, hosted Sanctum Cloud, proprietary threat intelligence, compliance packs. See [OPEN_CORE.md](./OPEN_CORE.md).

## Docs for developers

| Doc | Use when |
|-----|----------|
| [START_HERE.md](./START_HERE.md) | First clone — 60s path |
| [OPEN_CORE.md](./OPEN_CORE.md) | Public vs private boundary |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Monorepo layout, local AI |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Issues and PRs |
| [CHANGELOG.md](./CHANGELOG.md) | Releases |
| [PUBLISHING.md](./PUBLISHING.md) | Maintainers (npm, deploy) |

## License

[MIT](./LICENSE) — enterprise features may be separately licensed when shipped outside this repo.
