# Sanctum Runtime

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![GitHub](https://img.shields.io/github/stars/Matik103/sanctum-runtime?style=social)](https://github.com/Matik103/sanctum-runtime)

**Open-source (MIT) runtime trust infrastructure for autonomous AI systems** — a layer developers install into agents, backends, and robotics stacks.

> **New developer?** [START_HERE.md](./START_HERE.md) → then **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** (full API, SDK, policies, models, webhooks).  
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
  execute: async () => sendEmail(),
});
```

Marketing site + docs: configure `SITE_HOST` / `SITE_PORT` in `.env`, then `npm run dev` → `/docs`

## What you can do (OSS)

| Area | Possibilities |
|------|----------------|
| **Gate actions** | `verify` / `block` / `require human approval` on any action name |
| **Policies** | Unlimited actions; org keys (`acme:transfer`); YAML import/export; per-action `riskPrompt` |
| **Risk model** | Ollama (any local model), OpenAI-compatible APIs, or heuristics-only |
| **Agents** | `protectAgent()`, middleware, `awaitVerification` after dashboard approve |
| **Audit** | JSONL locally; Humans-style `humanRecord`; optional Supabase mirror |
| **Integrations** | Webhooks on verify/block/resolve; REST API; optional API key / Supabase JWT |
| **Ops** | Community dashboard, `npm run smoke`, GitHub Actions CI |

Full reference: **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)**

## Configuration

All endpoints are set in **`.env`** (see [`.env.example`](./.env.example)). Nothing assumes a fixed IP or port in application code.

| Variable | Purpose |
|----------|---------|
| `HOST` + `PORT` or `SANCTUM_API_URL` | Runtime API |
| `DASHBOARD_HOST` + `DASHBOARD_PORT` or `DASHBOARD_URL` | Community dashboard |
| `SITE_HOST` + `SITE_PORT` | Marketing / docs site |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Local risk model (or see `SANCTUM_RISK_PROVIDER`) |
| `SANCTUM_WEBHOOK_URL` | HTTP events on verify/block/resolve |
| `SANCTUM_API_KEY` | Optional API lockdown |

## Open-source map

| Package / app | Purpose |
|---------------|---------|
| [`packages/sdk`](./packages/sdk) | `@sanctum-runtime/sdk` SDK |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | Agent adapter |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy + risk + audit + webhooks |
| [`packages/policy-engine`](./packages/policy-engine) | Policies + YAML I/O |
| [`services/risk-model`](./services/risk-model) | Pluggable Ollama / OpenAI-compatible scoring |
| [`apps/api`](./apps/api) | HTTP API |
| [`apps/dashboard`](./apps/dashboard) | Community dashboard |
| [`examples/`](./examples/) | Samples |
| [`examples/policies.example.yaml`](./examples/policies.example.yaml) | Example policy file |

Enterprise features (fleet, cloud, advanced intel) are **not** in this repo — [OPEN_CORE.md](./OPEN_CORE.md).

## Docs

| Doc | Use when |
|-----|----------|
| [START_HERE.md](./START_HERE.md) | First run |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | **Full capabilities, API, SDK, env** |
| [`.env.example`](./.env.example) | All env vars |
| [OPEN_CORE.md](./OPEN_CORE.md) | OSS vs enterprise |
| [HOSTED.md](./HOSTED.md) | Deploy API to your infra |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Monorepo / local AI |
| [local-ai/MODELS.md](./local-ai/MODELS.md) | Ollama / GGUF setup |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Issues and PRs |

## License

[MIT](./LICENSE)
