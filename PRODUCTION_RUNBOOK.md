# Production runbook

Single checklist for **Sanctum control plane** in production (Render + Supabase). For marketing site and local dev, see [PRODUCTION_OPS.md](./PRODUCTION_OPS.md).

## Live stack (reference)

| Service | URL |
|---------|-----|
| API | `https://sanctum-api-6zgy.onrender.com` |
| Dashboard | `https://sanctum-dashboard.onrender.com` |
| Repo | `main` on GitHub → auto-deploy on Render |

```text
Operators ──► Dashboard (Supabase JWT)
                 │
Scripts/SDKs ──► API (sk_sanctum_* or legacy key)
                 │
                 ▼
            Supabase (orgs, fleet, audit, usage, …)
                 ▲
Runtimes ────────┘  connect · heartbeat · WS · memory
```

---

## 1. One-time setup

### 1.1 Supabase

```bash
npm run db:push    # applies migrations 001–024
```

Confirm in SQL Editor (or run the checks in §1.3):

| Object | Migration |
|--------|-----------|
| `registered_runtimes`, `registered_agents`, `runtime_events` | 010 |
| `runtime_packages`, `runtime_package_installs` | 017 |
| `usage_events` | 018 |
| `attestation_challenges` | 019 |
| `agent_memory_entries` | 016 |
| `plans`, `org_plans` | 023 |
| `sso_configs`, `export_audit`, notification columns on `org_plans` | 024 |

> **Marketplace catalog** (020–022) — 16 packages / 12 categories. If Marketplace shows 0 packages, confirm 017 + 020–022 ran.
>
> **Billing** (023) — every org gets `org_plans.plan_id = 'free'` via trigger + backfill.
>
> **Notifications / SSO / GDPR** (024) — per-org notification prefs; `export_audit` log; enterprise `sso_configs`.

### 1.3 Verify migrations (SQL Editor)

```sql
-- Should return 23 rows (one per migration file applied via CLI history, or spot-check tables):
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'organizations', 'organization_members', 'runtime_policies', 'audit_events',
    'registered_runtimes', 'registered_agents', 'runtime_events',
    'runtime_packages', 'runtime_package_installs',
    'usage_events', 'agent_memory_entries', 'attestation_challenges',
    'plans', 'org_plans', 'api_keys', 'sso_configs', 'export_audit'
  )
order by 1;

-- Marketplace row count (expect 16 after 022):
select count(*) as package_count from public.runtime_packages where visibility = 'public';

-- Every org on a plan:
select count(*) as orgs_without_plan
from public.organizations o
left join public.org_plans p on p.org_id = o.id
where p.org_id is null;
```

Link project: `supabase link` (if not already).

### 1.2 Render — API (Web Service)

| Key | Required | Notes |
|-----|----------|--------|
| `NODE_VERSION` | yes | `22` |
| `SUPABASE_URL` | yes | `https://REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | API only — never in dashboard build |
| `DASHBOARD_URL` | yes | Dashboard origin for CORS |
| `SANCTUM_API_KEY_PEPPER` | recommended | ≥16 chars; or derived from service role |
| `SANCTUM_ATTESTATION_SECRET` | optional | Hardware quote HMAC; else derived |
| `SANCTUM_OFFLINE_MODE` | optional | `true` if no OpenAI/Ollama on host |
| `SANCTUM_RISK_PROVIDER` | optional | `none` \| `openai` |
| Legacy `SANCTUM_API_KEY` | optional | Hex key for scripts; prefer dashboard `sk_sanctum_*` |
| `PADDLE_VENDOR_ID`, `PADDLE_PRODUCT_*`, `PADDLE_WEBHOOK_SECRET` | optional | Paid checkout + webhook → updates `org_plans` |
| `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` | optional | Quota/anomaly email alerts |
| `SLACK_WEBHOOK_URL` / per-org prefs in Settings | optional | Slack alerts |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | Distributed tracing |
| `SANCTUM_MIN_SDK_VERSION` | optional | Advisory on `/v1/runtimes/connect` |
| `SSO_ENCRYPTION_KEY` | optional | Encrypt OIDC client secrets (use KMS in prod) |

Redeploy after env changes.

### 1.3 Render — Dashboard (Static Site)

| Key | Required |
|-----|----------|
| `VITE_SANCTUM_API_URL` | API base URL |
| `VITE_SUPABASE_URL` | Same project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key only |

Build: `npm ci && npm run build:sdk && npm run build:dashboard`  
Publish: `apps/dashboard/dist`

### 1.4 Supabase auth URLs

| Field | Value |
|-------|--------|
| Site URL | Dashboard URL |
| Redirect URLs | `https://YOUR-DASHBOARD.onrender.com/**`, `http://127.0.0.1:5174/**` |

---

## 2. Deploy from `main`

1. Push to `main` → Render redeploys API + dashboard (if connected).
2. Wait for green deploy (~3–5 min).
3. Run smoke suite (below).

Manual: Render dashboard → **Manual Deploy** → **Deploy latest commit**.

---

## 3. Smoke tests

### Quick health

```bash
export SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com
export DASHBOARD_URL=https://sanctum-dashboard.onrender.com

npm run production:check
```

Set `SANCTUM_ORG_ID` to your workspace org for fleet map + usage checks.

### Full control plane

Use a dashboard **API key** (`sk_sanctum_…`), not the legacy hex `SANCTUM_API_KEY` unless you know you need it.

```bash
export SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com
export SANCTUM_API_KEY=sk_sanctum_...
export SANCTUM_ORG_ID=personal-xxxxxxxx   # from Devices or operator context

npm run smoke:control-plane
```

Optional encrypted memory line in smoke:

```bash
export SANCTUM_MEMORY_KEY='your-secret-min-16-chars'
```

### All-in-one

```bash
npm run smoke:production
```

Runs `production:check` then `smoke:control-plane`.

---

## 4. Operator workflows (dashboard)

| Task | Where |
|------|--------|
| Sign in / org | Login → Settings |
| API keys | **Devices** → create → copy `sk_sanctum_…` |
| Fleet | **Fleet** → runtimes, Map, dispatch |
| Marketplace | **Marketplace** → install template |
| Usage | **Settings** → Usage (30 days) |
| Policies / audit | **Policies**, **Audit logs**, **Runtime activity** |

**Fleet empty?** Use **All organizations**, or connect with the org tied to your API key (not `demo-org`).

---

## 5. Connect a runtime (customer / script)

```bash
export SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com
export SANCTUM_API_KEY=sk_sanctum_...
# optional: export SANCTUM_ORG_ID=...  # else resolved from operator context

npm run example:connect
npm run example:marketplace   # marketplace package + connect
```

SDK:

```ts
const runtime = new SanctumRuntime({ baseUrl, apiKey })
await runtime.connect({ runtimeName: 'bot-01', organizationId: 'your-org' })
```

Hardware attestation and WebSocket are **on by default** on connect.

---

## 6. Encrypted memory

```bash
export SANCTUM_MEMORY_KEY='...'   # ≥16 chars, never commit
npm run example:memory
```

**Rotate key:**

```bash
export SANCTUM_OLD_MEMORY_KEY='...'
export SANCTUM_MEMORY_KEY='...'
npm run example:memory-rotate
```

Update secrets store with the new key after rotation.

---

## 7. Production checklist

- [ ] `npm run db:push` — migrations 001–023 (see §1.3 SQL checks)
- [ ] API env: Supabase + `DASHBOARD_URL` + pepper
- [ ] Dashboard env: `VITE_*` trio
- [ ] Supabase redirect URLs
- [ ] `npm run smoke:production` passes
- [ ] Dashboard login → Fleet shows runtime after `example:connect`
- [ ] Create/revoke API key on **Devices**
- [ ] Policies exported (`GET /v1/policies/export.yaml`) — Render disk is ephemeral
- [ ] Revoke any keys pasted in chat or logs

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Fleet 500 / stale offline | Redeploy API (latest `main`); check `markStaleOffline` fix |
| Fleet empty | Org filter — use **All orgs** or match API key org |
| Create API key 500 | Set `SUPABASE_SERVICE_ROLE_KEY`; pepper falls back from service role |
| Revoke key failed | Redeploy API (CORS DELETE + empty DELETE body fix) |
| CORS on DELETE | `DASHBOARD_URL` exact match on API |
| `sk_sanctum_*` 401 locally | Use dashboard key in `.env`, not legacy hex key |
| Marketplace empty | `npm run db:push` (catalog in `017`–`022`) |
| Hardware `hw=false` | Run challenge before connect; redeploy API `94ed661+` |
| Usage all zeros | Run smoke or connect — usage records on events |
| Audit empty after refresh | Redeploy API with Supabase hydrate (`d042761+`) |

---

## 9. Related docs

| Doc | Topic |
|-----|--------|
| [PRODUCTION_OPS.md](./PRODUCTION_OPS.md) | Full stack + Cloudflare site |
| [RENDER.md](./RENDER.md) | API detail |
| [RENDER_DASHBOARD.md](./RENDER_DASHBOARD.md) | Static site |
| [docs/CONTROL_PLANE.md](./docs/CONTROL_PLANE.md) | Architecture + phase matrix |
| [docs/PHASE_3_MEMORY.md](./docs/PHASE_3_MEMORY.md) | Encrypted memory + rotation |
| [docs/PHASE_4_MARKETPLACE.md](./docs/PHASE_4_MARKETPLACE.md) | Marketplace |
| [docs/WEBSOCKET.md](./docs/WEBSOCKET.md) | Runtime WebSocket |

---

## 10. API surface (control plane)

```text
POST /v1/runtimes/connect          WS  /v1/runtimes/ws
POST /v1/runtimes/:id/heartbeat    GET /v1/fleet/map
GET  /v1/runtimes                  GET /v1/marketplace/packages
POST /v1/orchestration/dispatch    GET /v1/usage?org_id=
GET|PUT …/agents/:id/memory/:key   GET /v1/attestation/challenge
```

Auth: `Authorization: Bearer` (dashboard) or `X-Sanctum-Key` (scripts).
