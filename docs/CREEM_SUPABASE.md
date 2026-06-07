# Creem on Supabase (all secrets here)

Plan change flows (upgrade, downgrade, cancel, portal): **`docs/CREEM_BILLING_FLOWS.md`**

Store **all** Creem configuration as **Supabase Edge Function secrets**. Render only needs Supabase/DB vars for the API runtime — not Creem.

## Secrets checklist

Set in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, or run `./scripts/set-creem-supabase-secrets.sh` after filling `.env`.

| Secret | Required | Used by |
|--------|----------|---------|
| `CREEM_API_KEY` | Yes (checkout) | `creem-checkout` → Creem Checkout API |
| `CREEM_WEBHOOK_SECRET` | Yes (webhooks) | `creem-webhook` → HMAC verify |
| `CREEM_PRODUCT_PERSONAL` | Yes | Webhook product map + checkout |
| `CREEM_PRODUCT_OPERATOR` | If selling Operator | Same |
| `CREEM_PRODUCT_TEAM` | If selling Team | Same |
| `CREEM_PRODUCT_ENTERPRISE` | Optional | Same |
| `CREEM_API_BASE_URL` | Optional | `https://test-api.creem.io` when using `creem_test_*` key |
| `DASHBOARD_URL` | Recommended | Checkout success/cancel redirects |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for Edge Functions.

### Example (test mode)

```bash
supabase secrets set CREEM_API_KEY=creem_test_xxxxxxxx
supabase secrets set CREEM_API_BASE_URL=https://test-api.creem.io
supabase secrets set CREEM_WEBHOOK_SECRET=whsec_xxxxxxxx
supabase secrets set CREEM_PRODUCT_PERSONAL=prod_EhijX22KgQHQ1XZLG6fYY
supabase secrets set CREEM_PRODUCT_OPERATOR=prod_...
supabase secrets set CREEM_PRODUCT_TEAM=prod_...
supabase secrets set DASHBOARD_URL=https://console.sanctumruntime.com
```

## Deploy functions

```bash
npm run creem:deploy
# or:
supabase functions deploy creem-webhook --no-verify-jwt
supabase functions deploy creem-checkout
supabase functions deploy creem-sync
```

## URLs

| Purpose | URL |
|---------|-----|
| **Creem webhook** (dashboard) | `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-webhook` |
| **Checkout** (console calls) | `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-checkout` |
| **Post-checkout sync** (console) | `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-sync` |

Register only the **webhook** URL in Creem Developers → Webhooks.

## Flow

```text
Upgrade (console)
  → creem-checkout (JWT + CREEM_API_KEY + CREEM_PRODUCT_*)
  → If workspace already has creem_subscription_id: Creem subscription upgrade API (proration)
  → Else: Creem hosted checkout
  → creem-webhook (CREEM_WEBHOOK_SECRET + CREEM_PRODUCT_*)
  → org_plans + profiles.billing_org_id (idempotent via creem_webhook_events)
  → On success redirect: creem-sync reconciles checkout_id if webhook is slow
  → Console reads org_plans via Supabase client
```

**Render `POST /v1/billing/webhook` returns 410** — register Creem webhooks only on Supabase.

## Render

You can **remove** from Render (`sanctum-api`):

- `CREEM_API_KEY`
- `CREEM_WEBHOOK_SECRET`
- `CREEM_PRODUCT_*`
- `CREEM_CHECKOUT_*_URL`

Keep Render for agent/runtime APIs only.

## Troubleshooting

### `creem_checkout_failed` / `{"error":"unauthorized"}`

Creem rejected `CREEM_API_KEY`. Test and live are **isolated** — keys, base URL, and product IDs must match:

| Mode | API key prefix | `CREEM_API_BASE_URL` | Product IDs from |
|------|----------------|----------------------|------------------|
| Test | `creem_test_*` | `https://test-api.creem.io` (or omit; auto-detected) | Creem dashboard with **Test mode** on |
| Live | `creem_*` (not `creem_test_`) | `https://api.creem.io` (or omit) | Creem dashboard with **Test mode** off |

Common mistake after moving secrets off Render: `CREEM_API_BASE_URL` still points to test-api while the key or `CREEM_PRODUCT_OPERATOR` is from live (or the reverse).

Re-set secrets as a matched set:

```bash
# Test example
supabase secrets set CREEM_API_KEY=creem_test_xxxxxxxx
supabase secrets set CREEM_API_BASE_URL=https://test-api.creem.io
supabase secrets set CREEM_PRODUCT_OPERATOR=prod_...   # from test-mode Products tab

# Live example — remove test base URL or set production explicitly
supabase secrets set CREEM_API_KEY=creem_xxxxxxxx
supabase secrets unset CREEM_API_BASE_URL
# or: supabase secrets set CREEM_API_BASE_URL=https://api.creem.io
supabase secrets set CREEM_PRODUCT_OPERATOR=prod_...   # from live Products tab
```

Copy keys from **Creem → Developers** (toggle test/live in the sidebar bottom).

## Verify

```bash
# After secrets + deploy, resend a Creem test webhook or run a new checkout from Billing.
```

In SQL editor:

```sql
select p.email, p.billing_org_id, op.plan_id, op.creem_subscription_status
from profiles p
left join org_plans op on op.org_id = p.billing_org_id
where p.email ilike 'you@example.com';
```
