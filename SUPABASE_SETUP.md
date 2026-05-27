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

## Step 3 — Enable auth providers

### Email (operators)

1. **Authentication** → **Providers** → **Email**
2. Turn **Email** on
3. For local dev, you can disable **Confirm email** under Email settings (faster sign-up)

### SSO (enterprise — Google + GitHub)

Enable **Google** and **GitHub** under **Authentication** → **Providers**. Microsoft Entra is not used on the console.

| Dashboard button | Supabase provider |
|------------------|-------------------|
| Google | `google` |
| GitHub | `github` |

Set **Site URL** to your dashboard (e.g. `https://console.sanctumruntime.com`) and add the same host under **Redirect URLs**.

Step-by-step OAuth client setup: [docs/SUPABASE_SSO_SETUP.md](./docs/SUPABASE_SSO_SETUP.md).

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
| `008_auth_portal.sql` | Operator/enterprise profiles, domain SSO join, org bootstrap |
| `009` – `050` | Control plane, fleet, governance, billing, marketplace, compliance, push notifications, SSO, hardware attestation, marketplace trust boundary packs |
| `051_shield_rules.sql` | `shield_rules` (operator-defined containment) + `shield_containment_events` |
| `052_audit_shield_level.sql` | `shield_level` + `shield_score` columns on `audit_events`; partial indexes |
| `053_agent_token_rotation.sql` | `token_iat_min bigint` on `agent_registrations` for immediate token invalidation |
| `054_production_indexes.sql` | Performance indexes: `audit_events(actor)`, `audit_events(action)`, `shield_containment_events(audit_id)`, webhook dead-letter |

Run all migrations in order. See [supabase/README.md](./supabase/README.md) and the [SQL queries in PR #54](#) for copy-paste blocks.

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

## Enterprise org + domain join

After migration `008_auth_portal.sql`, map a company email domain to an org (SQL Editor):

```sql
insert into public.organizations (id, name)
values ('acme-corp', 'Acme Corp')
on conflict (id) do nothing;

insert into public.organization_domains (domain, org_id, verified)
values ('acme.com', 'acme-corp', true)
on conflict (domain) do nothing;
```

Users who sign in via **Enterprise SSO** with `@acme.com` are auto-added to `acme-corp`. Operators get a personal workspace org on signup (`personal-…`).

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

---

## Staying on the Supabase **free** plan

Sanctum’s API is tuned for free-tier limits so production does not need a paid database unless you outgrow them.

| Free-tier constraint | What Sanctum does |
|---------------------|-------------------|
| PostgREST **~8s** statement timeout | Each query capped at **5s** (`SUPABASE_QUERY_TIMEOUT_MS`) |
| Heavy **parallel** reads time out | GDPR export + compliance reports run queries **sequentially** |
| Large table scans | Row caps in `apps/api/src/supabase-limits.ts` (e.g. 500 audit rows/export, 2000 for compliance) |
| `organization_members` slow | Membership lookup uses timeouts; **no throw** → avoids API 500s |

### Operational habits (recommended)

1. **Do not** run huge SQL exports in the Supabase SQL Editor during peak dashboard use.
2. **GDPR export** is rate-limited to **1/hour per org** — enough for compliance, light on the DB.
3. **Audit volume**: free tier is fine for dev/small prod; archive or upgrade if `audit_events` grows past ~100k rows and list views slow down.
4. **Indexes**: migrations `007` and `002` already index `org_id` + `created_at` on audit — keep migrations applied (`npm run db:push`).
5. Optional API env: `SUPABASE_QUERY_TIMEOUT_MS=5000` (default). Lower only if you still see timeouts.

### When to upgrade Supabase

Upgrade if you need: longer queries, more connections, daily backups, or full historical compliance exports (10k+ audit rows per report). Until then, partial exports with `warnings` in the JSON are expected and valid for GDPR.

See also [supabase/README.md](./supabase/README.md) and `apps/api/src/supabase-limits.ts`.
