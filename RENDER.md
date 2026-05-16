# Deploy & test on Render.com

Small **Web Service** to run the Sanctum Runtime API for end-to-end testing. Dashboard and Ollama are optional (see below).

**Full production stack (API + Supabase + dashboard + marketing):** [PRODUCTION_OPS.md](./PRODUCTION_OPS.md)

---

## What you will get

| Service | Render plan | Purpose |
|---------|-------------|---------|
| **sanctum-api** | Free or Starter ($7/mo) | Runtime API — verify, policies, audit |
| **sanctum-dashboard** (optional) | Static Site or second Web Service | Operator UI |
| **Ollama** | Not on Render free tier | Use offline mode or OpenAI instead |

**Note:** Render free disk is **ephemeral** — audit/policy files in `data/` reset on redeploy. Fine for testing; use Supabase mirror or a paid disk for persistence.

---

## Part 1 — API only (recommended first test)

### Step 1: Generate secrets locally

```bash
openssl rand -hex 32
```

Save as `SANCTUM_API_KEY` (you will paste into Render).

### Step 2: Create Web Service on Render

1. Go to [render.com](https://render.com) → **New +** → **Web Service**
2. Connect **GitHub** → repo `Matik103/sanctum-runtime`
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `sanctum-api` |
| **Region** | Closest to you |
| **Branch** | `main` |
| **Root directory** | *(leave empty — repo root)* |
| **Runtime** | Node |
| **Build command** | `npm ci && npm run build:sdk && npm run build:packages` |
| **Start command** | `npm run start -w @sanctum/api` |
| **Plan** | Free (or Starter for always-on) |

### Step 3: Environment variables (Render → Environment)

Render sets `PORT` automatically — do **not** hardcode it.

| Key | Value |
|-----|--------|
| `HOST` | `0.0.0.0` |
| `NODE_VERSION` | `22` |
| `SANCTUM_OFFLINE_MODE` | `true` |
| `SANCTUM_RISK_PROVIDER` | `none` |
| `SANCTUM_API_KEY` | *(your openssl secret)* |
| `DASHBOARD_URL` | `https://your-dashboard.onrender.com` *(or `http://127.0.0.1:5174` until dashboard exists)* |

**Webhooks** (optional — HTTP POST on verify / block / resolve):

| Key | Value |
|-----|--------|
| `SANCTUM_WEBHOOK_URL` | Your receiver URL (e.g. [webhook.site](https://webhook.site) inbox, or `https://your-app.com/sanctum/events`) |
| `SANCTUM_WEBHOOK_SECRET` | *(optional)* HMAC secret → `X-Sanctum-Signature: sha256=...` |
| `SANCTUM_WEBHOOK_EVENTS` | `verification.required,action.blocked,verification.resolved` *(default: all three)* |

After adding webhook env vars, **Save** and wait for redeploy. Confirm:

```bash
curl -s -H "X-Sanctum-Key: $SANCTUM_API_KEY" "$SANCTUM_API_URL/v1/webhooks/status"
# → "configured": true
```

Test delivery: `WEBHOOK_UUID=<inbox-uuid> node scripts/test-render-webhook.mjs`

Optional later (OpenAI instead of Ollama):

| Key | Value |
|-----|--------|
| `SANCTUM_RISK_PROVIDER` | `openai` |
| `SANCTUM_OFFLINE_MODE` | `false` |
| `OPENAI_API_KEY` | `sk-...` |
| `OPENAI_MODEL` | `gpt-4o-mini` |

### Step 4: Health check

Render → **Settings** → **Health Check Path**: `/health`

### Step 5: Deploy

Click **Deploy**. Wait for build + start. Copy your URL, e.g.:

`https://sanctum-api.onrender.com`

### Step 6: Smoke test from your laptop

```bash
export SANCTUM_API_URL=https://sanctum-api.onrender.com
export SANCTUM_API_KEY=your-secret-here

curl -s "$SANCTUM_API_URL/health"
# → {"ok":true,...}

curl -s -H "X-Sanctum-Key: $SANCTUM_API_KEY" "$SANCTUM_API_URL/v1/status"

curl -s -X POST "$SANCTUM_API_URL/v1/actions/verify" \
  -H "Content-Type: application/json" \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{
    "actor": "render-test",
    "action": "unlock_door",
    "context": { "time": "02:13 AM", "owner_sleeping": true },
    "offlineMode": true
  }'
```

Expect `REQUIRE_VERIFICATION` or `BLOCKED` for `unlock_door`.

### Step 7: SDK test from your machine

```bash
cd sanctum-runtime
export SANCTUM_API_URL=https://sanctum-api.onrender.com
export SANCTUM_API_KEY=your-secret-here
npm run example:npm
```

---

## Part 2 — Optional dashboard on Render

### Option A: Static Site (simplest)

1. **New +** → **Static Site** → same repo
2. **Build command:** `npm ci && npm run build --workspace=@sanctum/dashboard`
3. **Publish directory:** `apps/dashboard/dist`
4. **Environment:**

| Key | Value |
|-----|--------|
| `VITE_SANCTUM_API_URL` | `https://sanctum-api.onrender.com` |

If the dashboard build expects a proxy, you may need a small env tweak — for Render, point the client at the public API URL directly (see dashboard `api.ts` / Vite env).

5. Update API service `DASHBOARD_URL` to your static site URL (for CORS).
6. Redeploy API.

### Option B: Skip dashboard

Use `curl` + `POST /v1/audit/:id/resolve` for verification tests (see DEVELOPER_GUIDE.md).

---

## Part 3 — Verification resume test (A→Z)

```bash
CORR=render-e2e-$(date +%s)

# 1. Verify → pending
RES=$(curl -s -X POST "$SANCTUM_API_URL/v1/actions/verify" \
  -H "Content-Type: application/json" \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d "{\"actor\":\"test\",\"action\":\"unlock_door\",\"context\":{\"owner_sleeping\":true},\"offlineMode\":true,\"correlationId\":\"$CORR\"}")

echo "$RES"
ID=$(echo "$RES" | node -pe "JSON.parse(require('fs').readFileSync(0)).id")

# 2. Poll status
curl -s -H "X-Sanctum-Key: $SANCTUM_API_KEY" "$SANCTUM_API_URL/v1/verifications/$CORR"

# 3. Approve
curl -s -X POST "$SANCTUM_API_URL/v1/audit/$ID/resolve" \
  -H "Content-Type: application/json" \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{"decision":"APPROVED","resolvedBy":"render-operator"}'

# 4. Confirm approved
curl -s -H "X-Sanctum-Key: $SANCTUM_API_KEY" "$SANCTUM_API_URL/v1/verifications/$CORR"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | Check Render logs; ensure `NODE_VERSION=22` |
| `Missing .env` on start | Pull latest `main` (cloud env no longer requires `.env` file) |
| `401 unauthorized` | Send header `X-Sanctum-Key` matching `SANCTUM_API_KEY` |
| Service sleeps (free plan) | First request after idle takes ~30s — normal on free tier |
| Policies reset after deploy | Ephemeral disk — expected on free; re-import YAML or use Supabase |
| Ollama errors | Use `SANCTUM_RISK_PROVIDER=none` or `SANCTUM_OFFLINE_MODE=true` on Render |

---

## Cost snapshot

| Plan | API | Good for |
|------|-----|----------|
| **Free** | Spins down after inactivity | Quick demo / your own testing |
| **Starter** ~$7/mo | Always on | Team E2E / light staging |

---

## Part 2 — Dashboard static site

See [PRODUCTION_OPS.md §3](./PRODUCTION_OPS.md#3-dashboard-static-site-on-render):

- **Build:** `npm ci && npm run build:sdk && npm run build:dashboard`
- **Publish:** `apps/dashboard/dist`
- **Build env:** `VITE_SANCTUM_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **API env:** `DASHBOARD_URL=https://your-dashboard.onrender.com`

---

## Next after Render passes

- [ ] Teammate repeats Steps 6–7 without your help  
- [ ] [PRODUCTION_OPS.md](./PRODUCTION_OPS.md) — Supabase + dashboard + marketing  
- [ ] `npm run production:check` against your URLs
