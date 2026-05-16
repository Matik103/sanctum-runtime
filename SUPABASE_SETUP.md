# Supabase auth setup (Sanctum dashboard + API)

Sanctum uses **your** Supabase project for dashboard sign-in (PRD §7). No Sanctum-hosted accounts — you create a free project at [supabase.com](https://supabase.com).

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
2. Paste contents of [`supabase/migrations/001_profiles.sql`](./supabase/migrations/001_profiles.sql)
3. **Run**

This creates `profiles` + RLS + a trigger on new users.

---

## Step 5 — Add keys to `.env`

In the repo root (`sanctum-runtime/.env`):

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbG...   # anon public
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...   # service_role — keep secret
```

You can use the same names with `VITE_` prefix for the dashboard; the dev server maps `SUPABASE_*` automatically.

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

## Security

- Never commit `.env` or paste **service_role** in chat/screenshots
- Never put `SUPABASE_SERVICE_ROLE_KEY` in the dashboard or marketing site
- For production, use RLS on all user tables and restrict API `HOST` to private networks or add API key + JWT together
