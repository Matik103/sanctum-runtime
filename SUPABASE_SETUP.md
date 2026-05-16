# Supabase auth setup (Sanctum dashboard + API)

Sanctum uses **your** Supabase project for dashboard sign-in. No Sanctum-hosted accounts — you create a free project at [supabase.com](https://supabase.com).

Auth is **optional**: if Supabase env vars are unset, the dashboard works without login (local dev).

---

## Step 1 — Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → pick org, name (e.g. `sanctum-dev`), database password, region
3. Wait until the project is **Active**

---

## Step 2 — Copy API keys

1. In Supabase: **Project Settings** (gear) → **API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` (safe in the browser)
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (**secret** — API only, never in frontend)

---

## Step 3 — Enable email auth

1. **Authentication** → **Providers** → **Email**
2. Turn **Email** on
3. For local dev, you can disable **Confirm email** under Email settings (faster sign-up)

---

## Step 4 — Run the database migration

1. **SQL Editor** → **New query**
2. **CLI (recommended):** `npm run db:push` after `supabase link --project-ref YOUR_REF`
3. **Or** SQL Editor — run each file in [`supabase/migrations/`](./supabase/migrations/) in order:

| File | Purpose |
|------|---------|
| `001_profiles.sql` | User profiles + signup trigger |
| `002_audit_events.sql` | Audit log mirror |
| `003_functions.sql` | `set_updated_at()` |
| `004_organizations.sql` | Orgs + members |
| `005_runtime_policies.sql` | Cloud policy storage |
| `006_webhook_deliveries.sql` | Webhook delivery log |
| `007_views_and_audit_fixes.sql` | Indexes + `pending_verifications` view |

See [supabase/README.md](./supabase/README.md).

This creates `profiles` + RLS + a trigger on new users.

---

## Step 5 — Add keys to `.env`

**Recommended** (after `supabase login`):

```bash
npm run env:pull
```

This writes `VITE_SUPABASE_*` plus `SUPABASE_*` server aliases into `.env` from your Supabase project API keys.

**Manual** (repo root `.env`):

```bash
# Project root URL only — NOT https://xxx.supabase.co/rest/v1/
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbG...   # server only — never dashboard build

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The API maps `VITE_*` → `SUPABASE_*` automatically when server vars are unset.

**Note:** Keys under **Edge Functions → Secrets** are for Edge Functions only. Sanctum API/dashboard use **Settings → API** keys (`env:pull` fetches those). Do not put `/rest/v1/` in the project URL.

**Optional:** If you still use `SANCTUM_API_KEY` for scripts, both JWT (dashboard) and API key (CLI) work on the API.

---

## Step 6 — Restart Sanctum

```bash
npm run dev:runtime
```

API log should include: `Supabase JWT auth enabled`

---

## Step 7 — Sign in

1. Open **http://127.0.0.1:5174**
2. You should see the **Sign in** screen (not the dashboard) when Supabase is configured
3. **Sign up** with email + password (min 6 characters)
4. After sign-in, the control plane loads; your email appears in the sidebar with **Sign out**

---

## How auth works

| Client | Auth |
|--------|------|
| **Dashboard** (browser) | Supabase session → `Authorization: Bearer <access_token>` to API |
| **Scripts / SDK** (`npm run smoke`) | `SANCTUM_API_KEY` header if set |
| **Neither configured** | Open API on localhost (dev only) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard shows API unreachable after login | Restart API; check `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| 401 unauthorized | Sign out and in again; confirm service role key matches project |
| Stuck on login, no error | Disable email confirmation in Supabase or confirm email from inbox |
| Want to disable auth | Remove `SUPABASE_*` lines from `.env` and restart |

---

## Production (Render API + hosted dashboard)

1. Run migrations (Step 4) on your Supabase project.
2. Add **API** env on Render: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **Authentication** → **URL configuration** → set **Site URL** and **Redirect URLs** to your hosted dashboard (e.g. `https://sanctum-dashboard.onrender.com/**`).
4. Build dashboard with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (see [PRODUCTION_OPS.md](./PRODUCTION_OPS.md)).

Audit entries sync to `audit_events` when the API runs with service role configured.

---

## Security

- Never commit `.env` or paste **service_role** in chat/screenshots
- Never put `SUPABASE_SERVICE_ROLE_KEY` in the dashboard static build or marketing site
- For production, use RLS on all user tables; keep `SANCTUM_API_KEY` for scripts and JWT for dashboard operators
