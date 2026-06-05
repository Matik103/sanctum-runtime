# Creem on Supabase (all secrets here)

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
supabase functions deploy creem-webhook --no-verify-jwt
supabase functions deploy creem-checkout
```

## URLs

| Purpose | URL |
|---------|-----|
| **Creem webhook** (dashboard) | `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-webhook` |
| **Checkout** (console calls) | `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-checkout` |

Register only the **webhook** URL in Creem Developers → Webhooks.

## Flow

```text
Upgrade (console)
  → creem-checkout (JWT + CREEM_API_KEY + CREEM_PRODUCT_*)
  → Creem hosted payment
  → creem-webhook (CREEM_WEBHOOK_SECRET + CREEM_PRODUCT_*)
  → org_plans + profiles.billing_org_id
  → Console reads org_plans via Supabase client
```

## Render

You can **remove** from Render (`sanctum-api`):

- `CREEM_API_KEY`
- `CREEM_WEBHOOK_SECRET`
- `CREEM_PRODUCT_*`
- `CREEM_CHECKOUT_*_URL`

Keep Render for agent/runtime APIs only.

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
