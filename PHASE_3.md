# Phase 3 — Live operator loop

Your dashboard is connected to production (`sanctum-api` + `sanctum-dashboard`). This phase fills the control plane with real audit data and walks through human review.

## Prerequisites

| Check | How |
|-------|-----|
| API healthy | `curl https://sanctum-api-6zgy.onrender.com/health` → `"ok":true` |
| Dashboard loads | [sanctum-dashboard.onrender.com](https://sanctum-dashboard.onrender.com) — no “API unreachable” |
| CORS | `DASHBOARD_URL=https://sanctum-dashboard.onrender.com` on **sanctum-api** |
| API key | Render → **sanctum-api** → `SANCTUM_API_KEY` (for scripts) |

## Step 1 — Seed demo events

From your laptop (repo cloned, or copy the script):

```bash
export SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com
export SANCTUM_API_KEY=<from Render sanctum-api Environment>

npm run seed:production
```

This posts three verifies: **approve**, **verify** (HITL), and **block**.

Refresh the dashboard **Overview** — you should see actions processed &gt; 0.

## Step 2 — Review queue

1. Open **Runtime Activity** or wait for the yellow **Review next** banner.
2. Open a `REQUIRE_VERIFICATION` entry.
3. Use shortcuts: **A** approve once · **Shift+A** always approve · **D** deny.

## Step 3 — Policies

1. **Policies** — confirm `unlock_door` is **Verify**, dangerous actions **Block**.
2. **Export YAML** — backup policies (`sanctum policies export` or dashboard).
3. Re-run one verify from **Devices** or CLI after changing a policy.

## Step 4 — API keys for agents

1. **Devices & API keys** → **Create key** (name: `ci` or `my-agent`).
2. Copy `sk_sanctum_…` once.
3. Point agents at the API:

```bash
export SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com
export SANCTUM_API_KEY=sk_sanctum_...
npx @sanctum-runtime/cli verify --actor my-agent --action read_calendar --offline
```

## Step 5 — Framework wiring

| Stack | Guide |
|-------|--------|
| LangChain | [docs/integrations/langchain.md](./docs/integrations/langchain.md) |
| CrewAI | [docs/integrations/crewai.md](./docs/integrations/crewai.md) |
| MCP | [docs/integrations/mcp.md](./docs/integrations/mcp.md) |
| Python | `pip install sanctum-runtime` · [packages/python-sdk](./packages/python-sdk/) |
| ROS 2 | [examples/ros2-starter](./examples/ros2-starter/) |

## Step 6 — Optional upgrades

| Goal | Action |
|------|--------|
| Better risk than heuristics | [PRODUCTION_OPS.md §4.5](./PRODUCTION_OPS.md) — `SANCTUM_RISK_PROVIDER=openai` on API |
| Supabase audit mirror | `SUPABASE_*` on API + migrations applied |
| Webhooks | `SANCTUM_WEBHOOK_*` on API · `npm run test:webhook` |
| Publish SDK | `npm publish -w @sanctum-runtime/sdk` · PyPI for Python package |

## Full remote E2E

```bash
SANCTUM_API_URL=... SANCTUM_API_KEY=... node scripts/handoff-remote-test.mjs
```

---

**Next phase (4):** marketing site → dashboard link, custom domains, enterprise SSO domains, npm/PyPI publish for external adopters.
