# Start here (developers)

**This repository is open source (MIT).** Configure your environment first — hosts and ports are **not** hardcoded in the app.

## 1. Configure

```bash
cp .env.example .env
# Edit .env — set HOST, PORT, DASHBOARD_*, SITE_*, OLLAMA_URL for your machine
```

See [`.env.example`](./.env.example) for every variable.

## 2. Run

**Run all commands from the repo root** (`sanctum-runtime/`, where `package.json` lives).  
If you see `ENOENT ... package.json` in your home folder, run `cd` into the clone first.

### API + SDK only (no dashboard, no Supabase)

```bash
npm install
npm run dev:api          # API at http://127.0.0.1:3001
npm run smoke            # in another terminal
npm run example:agent
```

### Full stack (API + dashboard UI)

```bash
npm install
npm run dev:runtime      # API + dashboard
npm run smoke
npm run example:agent
```

Optional: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for dashboard login (not required for OSS).

**npm-only app** (after packages are on npm):

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
export SANCTUM_API_URL=http://127.0.0.1:3001   # your API from .env
node examples/npm-consumer/run.mjs             # from a clone, or copy run.mjs into your app
```

- **Dashboard UI:** `http://127.0.0.1:5174` (from `DASHBOARD_*` in `.env`) — mission control  
- **API only (JSON):** `http://127.0.0.1:3001` — not the dashboard; use `/health` to probe the API  

If the dashboard shows blank / MIME errors, stop dev servers, run `rm -rf apps/dashboard/node_modules/.vite`, then `npm run dev:runtime` again and hard-refresh the browser.

## What is open source here?

| Path | What it is |
|------|------------|
| [`packages/sdk`](./packages/sdk) | `@sanctum-runtime/sdk` — embed in your agent or backend |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | `protectAgent()` — verify before execute |
| [`apps/api`](./apps/api) | Runtime API server |
| [`apps/dashboard`](./apps/dashboard) | Community control plane UI |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy + risk + audit pipeline |
| [`examples/`](./examples/) | Runnable samples |

**Not in this repo (enterprise / private):** fleet orchestration, hosted cloud, proprietary threat intelligence — [OPEN_CORE.md](./OPEN_CORE.md).

## Embed in your project

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

// Pass your API URL (from .env SANCTUM_API_URL, or explicit in production)
const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await protectAgent(sanctum, {
  actor: 'my-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

Or use `sanctum.middleware()` directly. In Node, the SDK reads `SANCTUM_API_URL` when `baseUrl` is omitted.

## Configuration reference

| Variable | Required? | Used by |
|----------|-----------|---------|
| `HOST` + `PORT` or `SANCTUM_API_URL` | **Yes** | API, SDK, smoke tests |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Recommended | Online risk scoring (offline still works) |
| `DASHBOARD_*` | Only for UI | `npm run dev:runtime` / dashboard |
| `SITE_*` | Only for marketing site | `npm run dev` |
| `SANCTUM_API_KEY` | Optional | Lock down API; scripts send it automatically |
| `SUPABASE_*` | Optional | Dashboard sign-in only |

## Developer readiness checklist

Before you ship or move to the next product stage, confirm:

- [ ] `npm run build:sdk` succeeds
- [ ] `npm run dev:api` → `curl http://127.0.0.1:3001/health` returns `"ok": true`
- [ ] `npm run smoke` — all checks pass
- [ ] `npm run example:agent` completes
- [ ] Your app: `npm install @sanctum-runtime/sdk` + `baseUrl` to your API
- [ ] (Optional) Ollama running for online model path
- [ ] (Optional) Dashboard at `DASHBOARD_URL` for operators

## More

- [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise
- [DEVELOPMENT.md](./DEVELOPMENT.md) — monorepo map
- [CONTRIBUTING.md](./CONTRIBUTING.md)
