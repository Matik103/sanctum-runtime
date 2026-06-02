# Deploy dashboard to Render (static site)

The operator UI lives on **Render** (not Cloudflare). Marketing/docs stay on Cloudflare.

**API (already live):** `https://api.sanctumruntime.com`

---

## Step 1 — Create static site

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Static Site**
2. Connect **Matik103/sanctum-runtime** → branch **main**
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `sanctum-dashboard` |
| **Build command** | `npm ci && npm run build:sdk && npm run build:dashboard` |
| **Publish directory** | `apps/dashboard/dist` |

---

## Step 2 — Environment (build-time)

Render → **Environment** → add:

| Key | Value |
|-----|--------|
| `VITE_SANCTUM_API_URL` | `https://api.sanctumruntime.com` |
| `VITE_SUPABASE_URL` | `https://YOUR_SUPABASE_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | *(Supabase → Settings → API → anon public)* |

Do **not** add `VITE_SUPABASE_SERVICE_ROLE_KEY` here.

---

## Step 3 — SPA routing

Render → **Redirects/Rewrites** → add:

| Source | Destination |
|--------|-------------|
| `/*` | `/index.html` |

(Or use Blueprint [`render.yaml`](./render.yaml) which includes this rule.)

---

## Step 4 — Wire API CORS + Supabase auth

Copy your dashboard URL, e.g. `https://console.sanctumruntime.com`

**sanctum-api** → Environment:

```bash
DASHBOARD_URL=https://console.sanctumruntime.com
```

Redeploy **sanctum-api**.

**Supabase** → Authentication → URL configuration:

| Field | Value |
|-------|--------|
| Site URL | `https://console.sanctumruntime.com` |
| Redirect URLs | `https://console.sanctumruntime.com/**` |

Keep `http://127.0.0.1:5174/**` for local dev.

---

## Step 5 — Verify

1. Open dashboard URL → sign in
2. **Policies** → change a policy → **Saving…** → check Supabase `runtime_policies`
3. Trigger verify from API → **Runtime activity** + **Review queue**

```bash
curl -s -H "X-Sanctum-Key: YOUR_KEY" https://api.sanctumruntime.com/v1/status
# supabaseConfigured: true
```

---

## URL map

| Product | Host |
|---------|------|
| Marketing + `/docs` | Cloudflare (your existing setup) |
| Dashboard | `https://console.sanctumruntime.com` |
| API | `https://api.sanctumruntime.com` |
