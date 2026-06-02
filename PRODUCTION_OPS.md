# Production ops — Phase 2 (Track A)

> **Control plane runbook:** [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) — deploy, env vars, smoke tests, Fleet/Marketplace ops.

Deploy **API + Supabase + dashboard + marketing site** so developers and operators use Sanctum without your laptop.

| Component | Host | Purpose |
|-----------|------|---------|
| **Runtime API** | Render Web Service | Verify, policies, audit, webhooks |
| **Supabase** | supabase.com | Dashboard login + durable **audit** mirror |
| **Dashboard** | Render Static Site | Human-in-the-loop review |
| **Marketing / docs** | Cloudflare Workers | Homepage + `/docs` |

**Already live?** If `sanctum-api` is on Render, start at [§2 Supabase](#2-supabase) then [§3 Dashboard](#3-dashboard-static-site-on-render).

---

## 1. Runtime API (Render)

See [RENDER.md](./RENDER.md) for the full API checklist.

**Minimum env (API service):**

| Key | Value | Notes |
|-----|--------|-------|
| `NODE_VERSION` | `22` | |
| `SANCTUM_OFFLINE_MODE` | `false` | `true` only for intentionally air-gapped deployments |
| `SANCTUM_RISK_PROVIDER` | `openai` | Use `none` only if you have no OpenAI key |
| `SANCTUM_RISK_MODEL` | `gpt-4o-mini` | Cost-effective default; swap for `gpt-4o` for higher accuracy |
| `SANCTUM_RISK_TIMEOUT_MS` | `8000` | Maximum model wait before deterministic fallback |
| `OPENAI_API_KEY` | `sk-…` | **Secret** — required when `SANCTUM_RISK_PROVIDER=openai` |
| `SANCTUM_API_KEY` | `openssl rand -hex 32` | |
| `DASHBOARD_URL` | Your dashboard URL (set after §3) | |
| `SUPABASE_URL` | From Supabase (§2) | |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — API only | |
| `SUPABASE_ANON_KEY` | Optional on API; required for JWT validation path | |
| `SANCTUM_API_KEY_PEPPER` | `openssl rand -base64 32` | **Secret** — dedicated hashing pepper |
| `SANCTUM_ACTION_TOKEN_SECRET` | `openssl rand -base64 32` | **Secret** — signed-action-token HMAC key |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npm run gen:vapid` | Web Push keypair for mobile approval notifications |
| `VAPID_SUBJECT` | `mailto:ops@sanctumruntime.com` | Required by Web Push spec |
| `RESEND_API_KEY` | `re_…` | **Secret** — transactional email (alerts, verifications) |
| `NOTIFICATION_FROM_EMAIL` | `Sanctum Runtime Alerts <alerts@sanctumruntime.com>` | Must be a verified Resend sender domain |
| `PADDLE_VENDOR_ID` | From Paddle dashboard | Billing integration |
| `PADDLE_WEBHOOK_SECRET` | **Secret** — from Paddle | Required to verify billing webhooks |
| `PADDLE_PRODUCT_OPERATOR` | Paddle product/price ID | Operator plan |
| `PADDLE_PRODUCT_TEAM` | Paddle product/price ID | Team plan |
| `PADDLE_PRODUCT_ENTERPRISE` | Paddle product/price ID | Enterprise plan |
| `PADDLE_SANDBOX` | `false` | Set `true` during testing; `false` in production |
| `SANCTUM_PUBLIC_API_URL` | `https://api.sanctumruntime.com` | Shown in action-token emails |

> **Tip:** `npm run gen:vapid` prints the VAPID key pair ready to paste.  
> `npm run gen:secrets` prints `SANCTUM_ACTION_TOKEN_SECRET` + `SANCTUM_API_KEY_PEPPER`.

**Reading the startup banner** — on every boot the API prints a single summary block:

```
┌──────────────────────────────────────────────────────────────────┐
  Sanctum Runtime API  [production]
├──────────────────────────────────────────────────────────────────┤
  Listening     : http://0.0.0.0:3000
  Risk model    : openai / gpt-4o-mini  offline=false  openai-key=✓
  Supabase      : url=✓  service-role=✓  jwt-auth=✓
  Email (Resend): ✓
  Push (VAPID)  : ✓
  Billing Paddle: ✓  sandbox=false
  Auth          : Supabase JWT + X-Sanctum-Key
  API key pepper: SANCTUM_API_KEY_PEPPER  ✓
  CORS origins  : https://console.sanctumruntime.com + 1 more
  Workers       : webhook=✓  email-queue=✓
└──────────────────────────────────────────────────────────────────┘
```

`✗ NOT SET` on any line means that integration is disabled. Missing production integrations also emit a `[startup] WARN:` line for easy log-stream alerting.

**Persistence:**

| Data | On Render free disk | With Supabase |
|------|---------------------|---------------|
| **Audit log** | Lost on redeploy | Mirrored to `audit_events` when `SUPABASE_*` set |
| **Policies** | Lost on redeploy | Export YAML (`GET /v1/policies/export.yaml`) or re-import; fleet sync is enterprise |

After deploy:

```bash
curl -s https://YOUR-API.onrender.com/health
```

### 1.1 Tuning knobs (all optional)

All of the following have sensible defaults and only need to be set if you've
observed a specific operational issue or want to tighten a particular
ceiling. Most appear as gauges/counters under `GET /metrics` so you can see
the effect of any change.

**Logging**

| Key | Default | Notes |
|-----|---------|-------|
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | `trace` `debug` `info` `warn` `error` `fatal`. Applies to both Fastify request logs and the shared logger used by background workers. |

**HTTP timeouts** — protect against slow-loris clients and hung backends

| Key | Default | Notes |
|-----|---------|-------|
| `SANCTUM_HTTP_CONNECTION_TIMEOUT_MS` | `60000` | Kills sockets stuck mid-handshake. |
| `SANCTUM_HTTP_REQUEST_TIMEOUT_MS` | `30000` | Caps the full request lifecycle. Anything that legitimately takes longer should be a background job. |

**Rate limiting** — tiered by auth signal

| Key | Default | Notes |
|-----|---------|-------|
| `SANCTUM_RATE_LIMIT_ANON` | `200` | Per-IP request budget per minute for unauthenticated traffic. |
| `SANCTUM_RATE_LIMIT_API_KEY` | `1000` | Per-key request budget per minute. Hashed bucket — one customer per bucket, no NAT-tenant noise. |

**Supabase**

| Key | Default | Notes |
|-----|---------|-------|
| `SUPABASE_FETCH_TIMEOUT_MS` | `8000` | Hard cap on every Supabase HTTP call (enforced at the `fetch` layer, not per-callsite). Clamped to 1 s – 30 s. Watch `sanctum_supabase_fetch_timeouts_total` in `/metrics`. |
| `SANCTUM_JWT_CACHE_TTL_MS` | `30000` | In-process cache TTL for verified Supabase JWTs — cuts Supabase auth calls by ~50× on active sessions. Clamped 1 s – 5 min. Hit ratio: `sanctum_jwt_cache_hits_total` / `(hits + misses)`. |

**Audit log (in-memory cap)** — the API mirrors audit entries to Supabase but keeps a hot in-memory window

| Key | Default | Notes |
|-----|---------|-------|
| `SANCTUM_AUDIT_CAP` | `500` | Max in-memory audit entries before FIFO eviction kicks in. Watch `sanctum_audit_evictions_total` — a steady non-zero rate means cap is too low for your workload. |
| `SANCTUM_AUDIT_DISK_BYTES` | `33554432` (32 MiB) | `audit.jsonl` rotation threshold. File is renamed to `audit.jsonl.1` (overwriting the previous `.1`) when exceeded; bounds total disk usage at ~2× this value. |

---

## 2. Supabase

### 2.1 Create project + migrations

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. **SQL Editor** → run in order:
   - [`supabase/migrations/001_profiles.sql`](./supabase/migrations/001_profiles.sql)
   - [`supabase/migrations/002_audit_events.sql`](./supabase/migrations/002_audit_events.sql)
3. **Authentication** → **Providers** → **Email** → enable (disable “Confirm email” for faster dev)

Details: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

### 2.2 Auth redirect URLs (required for hosted dashboard)

**Authentication** → **URL configuration**:

| Field | Value |
|-------|--------|
| **Site URL** | `https://YOUR-DASHBOARD.onrender.com` |
| **Redirect URLs** | `https://YOUR-DASHBOARD.onrender.com/**` |

Add `http://127.0.0.1:5174/**` for local dev.

### 2.3 API keys → Render (sanctum-api)

**Project Settings** → **API** (or local `npm run env:pull` then copy from `.env`).

**Project URL must be** `https://YOUR_REF.supabase.co` — **not** `.../rest/v1/`.

On **sanctum-api** (not the dashboard static site):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJ...   # secret — API only

# Or non-prefixed (same values):
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

The API accepts either `VITE_*` or `SUPABASE_*` names.

Redeploy API. Logs should show Supabase JWT auth enabled.

**Verify audit sync:**

```bash
export SANCTUM_API_URL=https://YOUR-API.onrender.com
export SANCTUM_API_KEY=your-key
curl -s -X POST "$SANCTUM_API_URL/v1/actions/verify" \
  -H "Content-Type: application/json" \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{"actor":"ops","action":"read_calendar","context":{},"offlineMode":true}'
```

Check **Table Editor** → `audit_events` in Supabase.

---

## 3. Dashboard (static site on Render)

### 3.1 Create static site

**Quick guide:** [RENDER_DASHBOARD.md](./RENDER_DASHBOARD.md)

**Option A — Blueprint:** Render → **New** → **Blueprint** → connect repo (uses [`render.yaml`](./render.yaml)). Skip if `sanctum-api` already exists — use Option B for dashboard only.

**Option B — Manual:**

1. Render → **New +** → **Static Site**
2. Repo: `Matik103/sanctum-runtime`, branch `main`
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `sanctum-dashboard` |
| **Build command** | `npm ci && npm run build:sdk && npm run build:dashboard` |
| **Publish directory** | `apps/dashboard/dist` |

### 3.2 Build-time environment (Render → Environment)

These are baked into the static bundle:

| Key | Value |
|-----|--------|
| `VITE_SANCTUM_API_URL` | `https://api.sanctumruntime.com` |
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` (no `/rest/v1/`) |
| `VITE_SUPABASE_ANON_KEY` | Anon public key |

Do **not** put `VITE_SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` on the static site.

### 3.3 Wire API CORS

On **sanctum-api**, set:

```bash
DASHBOARD_URL=https://YOUR-DASHBOARD.onrender.com
```

Redeploy API.

### 3.4 Sign in

1. Open dashboard URL → **Sign up** / **Sign in**
2. **Overview** should show runtime status; **Runtime activity** lists audit entries (from API + Supabase mirror)

**Local build test:**

```bash
export VITE_SANCTUM_API_URL=https://YOUR-API.onrender.com
export VITE_SUPABASE_URL=https://xxxx.supabase.co
export VITE_SUPABASE_ANON_KEY=eyJ...
npm run build:dashboard
npx vite preview --config apps/dashboard/vite.config.ts apps/dashboard
```

---

## 4. Marketing site (Cloudflare Workers)

The repo root is a TanStack Start app (`npm run build` → Workers).

### 4.1 Prerequisites

- Cloudflare account
- `wrangler login` or `CLOUDFLARE_API_TOKEN` in CI

### 4.2 Deploy

```bash
npm ci
npm run deploy   # build + wrangler deploy
```

Or split:

```bash
npm run cf:build
npm run cf:deploy
```

### 4.3 Custom domain (optional)

Cloudflare dashboard → your Worker → **Custom domains** → add `sanctum.dev` (example).

Set GitHub repo **About** → Website to this URL.

### 4.4 Env overrides (optional)

In Cloudflare **Workers** → **Settings** → **Variables**, or build-time in `.env`:

| Variable | Purpose |
|----------|---------|
| `VITE_GITHUB_URL` | Repo link on site |
| `VITE_EARLY_ACCESS_URL` | Enterprise waitlist form |
| `VITE_DOCS_PATH` | Default `/docs` |

---

## 4.5 OpenAI-compatible risk on Render (optional)

Better than heuristics-only when Ollama is not on the API host:

| Key | Value |
|-----|--------|
| `SANCTUM_RISK_PROVIDER` | `openai` |
| `SANCTUM_RISK_BASE_URL` | `https://api.openai.com/v1` (or compatible proxy) |
| `SANCTUM_RISK_MODEL` | e.g. `gpt-4o-mini` |
| `SANCTUM_RISK_TIMEOUT_MS` | `8000` (maximum wait before deterministic fallback) |
| `OPENAI_API_KEY` | Your provider key |

Redeploy **sanctum-api**. Dashboard **Devices** shows `OpenAI-compatible` when active.

---

## 5. End-to-end verification

```bash
# API
curl -s https://YOUR-API.onrender.com/health
curl -s https://YOUR-API.onrender.com/v1/push/vapid-key

# Auth + webhooks (if configured)
curl -s -H "X-Sanctum-Key: $SANCTUM_API_KEY" https://YOUR-API.onrender.com/v1/webhooks/status

# Handoff suite
export SANCTUM_API_URL=https://YOUR-API.onrender.com
export SANCTUM_API_KEY=...
npm run test:webhook   # if webhooks configured

# SDK against production
npm run example:npm
```

**Operator path:** dashboard → sign in → trigger verify from script → approve in **Review queue**.

---

## 6. Production checklist

- [ ] API on Render — health OK, `SANCTUM_API_KEY` set
- [ ] API secrets set — dedicated `SANCTUM_API_KEY_PEPPER` and `SANCTUM_ACTION_TOKEN_SECRET`
- [ ] Mobile push ready — `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` on API and `/v1/push/vapid-key` returns the public key
- [ ] Supabase migrations applied
- [ ] `SUPABASE_*` on API — audit rows appear in Supabase
- [ ] Dashboard static site — build env has `VITE_SANCTUM_API_URL` + Supabase anon
- [ ] `DASHBOARD_URL` on API matches dashboard host
- [ ] Supabase redirect URLs include dashboard URL
- [ ] Marketing site deployed (Cloudflare)
- [ ] Policies backed up via YAML export (disk is ephemeral on Render)
- [ ] Secrets rotated; service role never committed or in static build
- [ ] (Optional) Render **Starter** on API for always-on demos

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dashboard “API unreachable” | Check `VITE_SANCTUM_API_URL`; redeploy dashboard after changing |
| CORS error in browser | Set `DASHBOARD_URL` on API to exact dashboard origin; redeploy API |
| 401 after login | `SUPABASE_SERVICE_ROLE_KEY` on API; sign out/in |
| Audit empty in Supabase | Run migration `002_audit_events.sql`; check API logs for sync errors |
| Policies reset after redeploy | Expected on Render free — import YAML or use `POST /v1/policies/import.yaml` |
| Marketing build fails locally | Set `SITE_HOST` + `SITE_PORT` only for `npm run dev`; use `npm run cf:build` for production build |

---

## Related

- [RENDER.md](./RENDER.md) — API + webhooks
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) — local Supabase
- [HOSTED.md](./HOSTED.md) — self-host / Docker
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — OSS API reference
