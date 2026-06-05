# Creem billing (test + production)

Sanctum uses [Creem](https://creem.io) as Merchant of Record for Personal, Operator, and Team plans.

**Recommended:** [Creem → Supabase webhook](./CREEM_SUPABASE_WEBHOOK.md) (Edge Function writes `org_plans` directly). Use Render API for checkout only.

See [Getting started](https://docs.creem.io/getting-started/introduction) and [Webhooks](https://docs.creem.io/code/webhooks).

## Test environment

1. Sign up at [creem.io](https://creem.io) and open the dashboard.
2. Copy your **test API key** (`creem_test_...`) from Developers.
3. Create three recurring products (Personal $12, Operator $59, Team $299) or use the CLI:

```bash
brew tap armitage-labs/creem && brew install creem
creem login --api-key creem_test_YOUR_KEY
creem products create --name "Sanctum Personal" --price 1200 --currency USD --billing-type recurring --billing-period every-month
```

4. Set API env (local `.env` or Render):

```bash
CREEM_API_KEY=creem_test_...
# Optional override (defaults to test-api when key is creem_test_*)
CREEM_API_BASE_URL=https://test-api.creem.io
CREEM_WEBHOOK_SECRET=whsec_...   # Developers → Webhooks

CREEM_PRODUCT_PERSONAL=prod_...
CREEM_PRODUCT_OPERATOR=prod_...
CREEM_PRODUCT_TEAM=prod_...
```

5. Register webhook URL (use ngrok for local dev):

```text
https://YOUR_API_HOST/v1/billing/webhook
```

Creem signs payloads with `creem-signature` (HMAC-SHA256 of raw body). Our handler verifies before updating `org_plans`.

## Checkout flow

**Preferred:** Checkout API (`POST /v1/checkouts` on Creem) when `CREEM_API_KEY` + `CREEM_PRODUCT_*` are set. The API passes metadata:

```json
{
  "org_id": "<workspace org id>",
  "plan": "personal|operator|team",
  "referenceId": "<same org id>"
}
```

**Fallback:** Static checkout links (`CREEM_CHECKOUT_PERSONAL_URL`, etc.) with `org_id`, `plan`, and `request_id` query params.

Success redirect: `{DASHBOARD_URL}/?page=billing&checkout=success`

## Webhook events

| Event | Action |
|-------|--------|
| `checkout.completed` | Grant plan from metadata / product id |
| `subscription.paid` | Grant plan (authoritative for renewals) |
| `subscription.active` / `subscription.trialing` | Grant plan (fallback when dashboard enables these events) |
| `subscription.canceled` / `expired` / `paused` | Downgrade to **Observer** |
| `subscription.scheduled_cancel` | Update status only; plan stays until period end |
| `subscription.past_due` | Set `billing_status=payment_failed`; notify |

**Org resolution:** `metadata.org_id` / `request_id` from dashboard checkout, else match `creem_customer_id`, else owner email on the Creem customer.

**Render (sanctum-api):** set `CREEM_WEBHOOK_SECRET` to the Creem signing secret and map each product:

```bash
CREEM_PRODUCT_PERSONAL=prod_EhijX22KgQHQ1XZLG6fYY   # example test product id
```

Webhooks are handled only on the API (not Supabase Edge). After payment, dashboard calls `POST /v1/billing/sync` as a backup.

If a grant event arrives with `org_id` but the plan cannot be resolved (no `metadata.plan` and no `CREEM_PRODUCT_*` match), the API returns **500** `grant_plan_unresolved` so Creem retries after you fix product env vars.

**Entitlements:** `org_plans.plan_id` is read on every gated request via `EntitlementEngine.getLimits()` — limits come from code (`PLAN_DEFAULTS`), not the `plans` table row. After webhook upsert, new limits apply immediately (no cache).

**Profile linkage:** Each user has `profiles.billing_org_id` pointing at the workspace that owns Creem billing. Set on checkout start and webhooks; shown on **Settings → Your account** and in the `my_profile` view (`subscription_plan_id`, `creem_subscription_status`). Plan rows live in `org_plans`, not on `profiles`.

## Supabase

Run migrations:

- `058_pricing_observer_personal.sql` — plan tiers
- `059_creem_billing_columns.sql` — `creem_customer_id`, `creem_subscription_id`

## Verify setup

```bash
# Config (no secrets returned)
curl -s "$SANCTUM_API_URL/v1/billing/creem/config" -H "Authorization: Bearer $TOKEN"

# Signed webhook dry-run
CREEM_WEBHOOK_SECRET=whsec_... node scripts/test-creem-webhook.mjs
```

## Production

- Swap to live API key (no `creem_test_` prefix) → `https://api.creem.io`
- Register production webhook URL on the live Creem dashboard
- Set the same `CREEM_PRODUCT_*` ids from live products
