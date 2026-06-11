# Creem test-mode rebuild guide

Rebuild Sanctum billing against a **Creem test account** using only official APIs and Supabase Edge Functions. Use this when checkout fails, secrets were moved, or you want a clean sandbox before going live.

**Official docs:** https://docs.creem.io  
**Doc index (LLM-friendly):** https://docs.creem.io/llms.txt

---

## What we have today

| Layer | Role |
|-------|------|
| `creem-checkout` | New checkout, upgrade/downgrade, cancel → Developer |
| `creem-webhook` | HMAC verify, idempotent `org_plans` updates |
| `creem-sync` | Post-redirect reconcile via `GET /v1/checkouts/{id}` |
| `creem-portal` | Customer billing portal link |
| `org_plans` | Source of truth: `plan_id`, Creem IDs, status |
| Render API | **Fallback only** — checkout/sync if Edge fails; webhook returns **410** |

The Edge Function flow matches Creem’s documented APIs. Most production failures are **environment mismatch** (test key + live product IDs, or vice versa), not missing logic.

---

## Creem official API map (test mode)

| Action | Creem endpoint | Sanctum handler |
|--------|----------------|-----------------|
| First subscription | `POST https://test-api.creem.io/v1/checkouts` | `creem-checkout` |
| Upgrade / downgrade | `POST /v1/subscriptions/{id}/upgrade` | `creem-checkout` |
| Cancel (→ Developer) | `POST /v1/subscriptions/{id}/cancel` `{ mode: "scheduled" }` | `creem-checkout` |
| Customer portal | `POST /v1/customers/billing` | `creem-portal` |
| Payment events | Webhook `creem-signature` HMAC-SHA256 | `creem-webhook` |
| Redirect params | `checkout_id`, `customer_id`, `subscription_id`, `signature` | `creem-sync` + Billing UI |

### Checkout body (official — no `cancel_url`)

```json
{
  "product_id": "prod_...",
  "request_id": "<org_id>",
  "success_url": "https://console.sanctumruntime.com/?page=billing&checkout=success&org_id=...",
  "metadata": { "org_id": "<org_id>", "plan_id": "personal" },
  "customer": { "email": "user@example.com" }
}
```

Creem **rejects** `cancel_url` (`property cancel_url should not exist`). Cancel behavior is configured on the product in Creem Dashboard.

### Webhook events (handle all)

| Event | Sanctum action |
|-------|----------------|
| `checkout.completed` | Grant plan |
| `subscription.active`, `subscription.trialing`, `subscription.paid` | Grant plan |
| `subscription.scheduled_cancel` | Status only |
| `subscription.past_due` | `billing_status: payment_failed` |
| `subscription.canceled`, `subscription.expired`, `subscription.paused` | Revoke → `observer` |

Docs: [Introduction](https://docs.creem.io/api-reference/introduction), [Checkout API](https://docs.creem.io/features/checkout/checkout-api), [Upgrade subscription](https://docs.creem.io/api-reference/endpoint/upgrade-subscription).

### Test cards (Creem sandbox)

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |

Any future expiry, any CVV.

---

## Rebuild checklist (test account)

### 1. Creem Dashboard (Test mode ON)

Toggle **Test mode** in the Creem sidebar (bottom).

1. **Developers → API Keys** — copy test key (`creem_test_*`)
2. **Developers → Webhooks** — create webhook:
   - URL: `https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-webhook`
   - Copy **Webhook secret**
3. **Products** — create three **recurring monthly** products (test mode):

| Sanctum plan | Suggested price | Secret name |
|--------------|-----------------|-------------|
| Personal | $12/mo | `CREEM_PRODUCT_PERSONAL` |
| Operator | $59/mo | `CREEM_PRODUCT_OPERATOR` |
| Team | $299/mo | `CREEM_PRODUCT_TEAM` |

Copy each product ID (`prod_...`) from Products → ⋮ → Copy ID.

Developer (`observer`) is free — no Creem product.

### 2. Local `.env` (for scripts only)

```bash
CREEM_API_KEY=creem_test_xxxxxxxx
CREEM_API_BASE_URL=https://test-api.creem.io
CREEM_WEBHOOK_SECRET=whsec_xxxxxxxx
CREEM_PRODUCT_PERSONAL=prod_...
CREEM_PRODUCT_OPERATOR=prod_...
CREEM_PRODUCT_TEAM=prod_...
DASHBOARD_URL=https://console.sanctumruntime.com
```

### 3. Push secrets to Supabase

```bash
npm run creem:secrets
npm run creem:deploy
```

### 4. Verify before touching the console

```bash
npm run creem:verify-test
```

This checks key/base URL alignment and creates a dry checkout session per product against `test-api.creem.io`.

### 5. End-to-end in console

1. Sign in as workspace **owner**
2. Billing → **Upgrade to Personal**
3. Pay with `4242 4242 4242 4242`
4. Redirect → plan syncs via webhook + `creem-sync`
5. Upgrade to Operator (subscription upgrade API — no new checkout page)
6. **Switch to Developer** → scheduled cancel
7. **Manage billing in Creem** → portal opens

### 6. Webhook smoke test

```bash
npm run test:creem-webhook -- --org-id <your-org-uuid> --plan personal
```

---

## Gaps vs official docs (fix list)

| Issue | Status | Action |
|-------|--------|--------|
| `cancel_url` in checkout | Fixed in `794b746` | Redeploy `creem-checkout` if not done |
| Test/live secret mismatch | Ops | Run `creem:verify-test`; fix matched set |
| Render API fallback masks Edge errors | By design | Prefer Supabase path; read `hint` in UI |
| `CREEM_BILLING.md` stale (Render webhook) | Doc drift | Use `CREEM_SUPABASE.md` as canonical |
| Redirect `signature` not verified | Not implemented | Optional hardening in `creem-sync` |
| API key prefix docs vary (`creem_test_` vs `ck_test_`) | Docs inconsistency | Sanctum uses `creem_test_*` per Creem API intro |

---

## Simplified architecture (recommended)

```text
Console Billing.tsx
  └─ changePlan() ──► Supabase creem-checkout (JWT)
                        └─ Creem test-api.creem.io
  └─ sync on redirect ──► creem-sync
  └─ portal ───────────► creem-portal

Creem webhook ─────────► creem-webhook ──► org_plans

Render POST /v1/billing/webhook → 410 (do not register)
Render POST /v1/billing/checkout → fallback only if Edge 503
```

**Do not** put Creem secrets on Render once Supabase path is verified.

---

## Going live (after test passes)

1. Creem Dashboard → turn **Test mode OFF**
2. Create **live** products; copy live `prod_*` IDs
3. Replace Supabase secrets with live `creem_*` key (not `creem_test_*`)
4. `supabase secrets unset CREEM_API_BASE_URL` (or set `https://api.creem.io`)
5. Register **live** webhook URL (same Supabase endpoint)
6. `npm run creem:deploy`
7. One real $1 test charge on Personal before announcing

---

## Useful links

- [API Introduction](https://docs.creem.io/api-reference/introduction)
- [Create checkout](https://docs.creem.io/api-reference/endpoint/create-checkout)
- [Upgrade subscription](https://docs.creem.io/api-reference/endpoint/upgrade-subscription)
- [TypeScript SDK](https://docs.creem.io/code/sdks/typescript-core)
- Sanctum: `docs/CREEM_SUPABASE.md`, `docs/CREEM_BILLING_FLOWS.md`
