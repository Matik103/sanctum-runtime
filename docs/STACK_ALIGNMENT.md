# Stack alignment checklist (Supabase ↔ Render ↔ codebase)

Verified against linked project **`nimvcudvrhanxlcpiizz`** (`supabase/config.toml`).

## Supabase (database)

| Check | Status |
|-------|--------|
| Migrations **001–059** applied on remote | Yes (`npm run db:push`, Jun 2026) |
| **057** Connect tools + settings columns | Present |
| **058** Observer / Personal / Operator / Team plans | `public.plans` matches API `PLAN_DEFAULTS` |
| **059** `creem_customer_id`, `creem_subscription_id` on `org_plans` | Present |
| `assign_free_plan()` → new orgs get **observer** | Yes |
| `org_plans.plan_id` default | **observer** (059) |

Re-verify anytime:

```bash
npm run db:status      # migration list --linked
npm run plans:verify   # DB plans vs entitlements code
```

## Local `.env` (dev)

| Check | Status |
|-------|--------|
| `SUPABASE_URL` host = `nimvcudvrhanxlcpiizz.supabase.co` | Yes |
| Service role + anon keys | Set |
| Creem vars | Usually **Render only** — not required locally unless testing checkout |

## Render — sanctum-api

Production API: `https://api.sanctumruntime.com` (deployed commit should match `main`).

**Must use the same Supabase project** as local `.env`:

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | `https://nimvcudvrhanxlcpiizz.supabase.co` |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | Project anon key |
| `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_SERVICE_ROLE_KEY` | Service role (secret) |
| `DASHBOARD_URL` | `https://console.sanctumruntime.com` (CORS) |
| `SANCTUM_PUBLIC_API_URL` | `https://api.sanctumruntime.com` |

**Creem (billing → `org_plans`):**

| Variable | Purpose |
|----------|---------|
| `CREEM_API_KEY` | Checkout API (`creem_test_...` or live) |
| `CREEM_WEBHOOK_SECRET` | Webhook signature |
| `CREEM_PRODUCT_PERSONAL` | Maps webhook product → plan |
| `CREEM_PRODUCT_OPERATOR` | Same |
| `CREEM_PRODUCT_TEAM` | Same |

Webhook URL (Creem dashboard):

```text
https://api.sanctumruntime.com/v1/billing/webhook
```

After changing env on Render, **redeploy sanctum-api**.

## Render — dashboard (static site)

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | Same Supabase URL as API |
| `VITE_SUPABASE_ANON_KEY` | Anon key only (never service role) |
| `VITE_SANCTUM_API_URL` | `https://api.sanctumruntime.com` |

## Supabase Auth URLs

**Authentication** → **URL configuration**:

| Field | Value |
|-------|--------|
| Site URL | `https://console.sanctumruntime.com` |
| Redirect URLs | `https://console.sanctumruntime.com/**`, `http://127.0.0.1:5174/**` |

## Code paths (single flow)

1. Sign-up → `organizations` + trigger → `org_plans.plan_id = observer`
2. API `EntitlementEngine` reads `org_plans.plan_id` + limits from `public.plans`
3. Upgrade → Creem checkout → webhook → `org_plans` upsert paid tier
4. Gates use `entitlements-gate.ts` + quotas from step 2

See [CREEM_BILLING.md](./CREEM_BILLING.md) and [SUPABASE_SETUP.md](../SUPABASE_SETUP.md).
