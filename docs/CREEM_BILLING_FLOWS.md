# Creem billing flows (Sanctum)

Canonical mapping from [Creem docs](https://docs.creem.io) to Sanctum Edge Functions and `org_plans`.

## Environments

| Mode | API base | API key | Product IDs |
|------|----------|---------|-------------|
| Test | `https://test-api.creem.io` | `creem_test_*` | Creem dashboard with **Test mode** on |
| Live | `https://api.creem.io` | `creem_*` (not `creem_test_`) | Creem dashboard with Test mode off |

Set secrets in Supabase (`docs/CREEM_SUPABASE.md`). Never mix test key with live product IDs.

## Sanctum entry points

| Console action | Edge Function | Creem API |
|----------------|---------------|-----------|
| First paid plan (no subscription) | `creem-checkout` | `POST /v1/checkouts` |
| Upgrade / downgrade between paid tiers | `creem-checkout` | `POST /v1/subscriptions/{id}/upgrade` |
| Return to Observer (cancel) | `creem-checkout` (`plan_id=observer`) | `POST /v1/subscriptions/{id}/cancel` |
| Manage payment method / self-service | `creem-portal` | `POST /v1/customers/billing` |
| Payment events | `creem-webhook` | Creem → webhook URL |
| Post-redirect reconcile | `creem-sync` | `GET /v1/checkouts/{id}` |

Render `POST /v1/billing/webhook` returns **410** — register webhooks only on Supabase.

## Flow decision tree

```text
User picks target plan on Billing
  │
  ├─ target = observer AND creem_subscription_id exists
  │     → POST /v1/subscriptions/{id}/cancel  { mode: "scheduled" }
  │     → org_plans: creem_subscription_status = scheduled_cancel (plan_id unchanged until period end)
  │     → webhook subscription.canceled → plan_id = observer
  │
  ├─ creem_subscription_id exists AND target is paid tier (upgrade)
  │     → POST /v1/subscriptions/{id}/upgrade  { product_id, update_behavior: "proration-charge-immediately" }
  │     → org_plans.plan_id updated immediately; webhook may follow
  │
  ├─ creem_subscription_id exists AND target is lower paid tier (downgrade)
  │     → POST /v1/subscriptions/{id}/upgrade  (Creem billing changes immediately + prorated credit)
  │     → org_plans.plan_id unchanged until current_period_end
  │     → pending_plan_id + pending_plan_effective_at set; applied at period end (webhook/sync/entitlements)
  │
  └─ no creem_subscription_id
        → POST /v1/checkouts  (metadata: org_id, plan_id)
        → user pays on Creem hosted page
        → webhook checkout.completed / subscription.paid → org_plans grant
```

## Creem API reference (subscriptions)

### Change plan (upgrade **and** downgrade between products)

```http
POST /v1/subscriptions/{subscription_id}/upgrade
x-api-key: creem_test_...
Content-Type: application/json

{
  "product_id": "prod_OPERATOR_TEST",
  "update_behavior": "proration-charge-immediately"
}
```

- Plan change is **immediate**.
- **Upgrade:** prorated charge on card on file.
- **Downgrade:** prorated refund per Creem rules.
- `update_behavior` options: `proration-charge-immediately` (default), `proration-charge` (deprecated), `proration-none`.

Docs: [Upgrade subscription](https://docs.creem.io/api-reference/endpoint/upgrade-subscription), [Managing subscriptions](https://docs.creem.io/features/subscriptions/managing).

### Cancel (Observer / end subscription)

```http
POST /v1/subscriptions/{subscription_id}/cancel
Content-Type: application/json

{ "mode": "scheduled" }
```

| `mode` | Behavior |
|--------|----------|
| `scheduled` | **Recommended.** Access until current period ends; status `scheduled_cancel`. |
| `immediate` | Access ends now; status `canceled`. |

Docs: [Cancel subscription](https://docs.creem.io/api-reference/endpoint/cancel-subscription).

### New subscription (checkout)

```http
POST /v1/checkouts
Content-Type: application/json

{
  "product_id": "prod_...",
  "request_id": "<org_id>",
  "metadata": { "org_id": "<org_id>", "plan": "personal", "plan_id": "personal" },
  "success_url": "https://console.sanctumruntime.com/?page=billing&checkout=success&org_id=...",
  "customer": { "email": "user@example.com" }
}
```

Do **not** use checkout when the customer already has an active `creem_subscription_id` — Creem returns **400**.

Docs: [Create checkout](https://docs.creem.io/api-reference/endpoint/create-checkout).

### Customer portal

```http
POST /v1/customers/billing
Content-Type: application/json

{ "customer_id": "cust_..." }
```

Response: `{ "customer_portal_link": "https://..." }` — payment methods, cancel, invoices.

Docs: [Customer billing links](https://docs.creem.io/api-reference/endpoint/create-customer-billing).

## Webhooks (Supabase `creem-webhook`)

| Event | Sanctum action |
|-------|----------------|
| `checkout.completed`, `subscription.paid`, `subscription.active`, `subscription.trialing` | Grant `plan_id`, store Creem IDs |
| `subscription.scheduled_cancel` | Status only (`scheduled_cancel`) |
| `subscription.past_due` | `billing_status: payment_failed` (plan unchanged) |
| `subscription.canceled`, `subscription.expired`, `subscription.paused` | Revoke to `observer` |

Idempotency: `creem_webhook_events.event_id` (migration 067).

## Database

| Table / column | Role |
|----------------|------|
| `org_plans.plan_id` | Entitlement tier (features/quotas) |
| `org_plans.pending_plan_id` | Lower tier scheduled at period end after paid downgrade |
| `org_plans.pending_plan_effective_at` | When `pending_plan_id` replaces `plan_id` |
| `org_plans.creem_subscription_id` | Required for upgrade/downgrade/cancel APIs |
| `org_plans.creem_customer_id` | Customer portal |
| `profiles.billing_org_id` | Which workspace bills this user |

## Console UX

- **Upgrade** → immediate `plan_id` grant.
- **Downgrade to lower paid tier** → Creem billing updates now; Sanctum keeps current entitlements until period end (banner shows pending tier + date).
- **Return to Observer** → scheduled cancel (unchanged).
- **Return to Observer** → `changePlan(orgId, 'observer')` → scheduled cancel.
- **Manage billing in Creem** → `openCustomerPortal(orgId)` when `creem_customer_id` exists.
- After checkout redirect → `creem-sync` with `checkout_id` if webhook is slow.
