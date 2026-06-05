# Creem billing via Supabase (recommended)

Use this **instead of** pointing Creem at the Render API. One webhook → one database update.

## Flow

```text
User pays on Creem
    → Creem POST webhook
    → Supabase Edge Function `creem-webhook`
    → Updates `org_plans` + `profiles.billing_org_id`
    → Console reads plan from Supabase (RLS)
```

Render API is only needed for **checkout session creation** (`POST /v1/billing/checkout`), not for webhooks.

## 1. Deploy the Edge Function

```bash
supabase secrets set CREEM_WEBHOOK_SECRET=whsec_...
supabase secrets set CREEM_PRODUCT_PERSONAL=prod_EhijX22KgQHQ1XZLG6fYY
supabase secrets set CREEM_PRODUCT_OPERATOR=prod_...
supabase secrets set CREEM_PRODUCT_TEAM=prod_...

supabase functions deploy creem-webhook --no-verify-jwt
```

Webhook URL (replace project ref):

```text
https://nimvcudvrhanxlcpiizz.supabase.co/functions/v1/creem-webhook
```

In Creem Dashboard → Developers → Webhooks, set this URL and the same signing secret.

## 2. Console

- **Billing** and **Settings → Your account** read `org_plans` from Supabase first (plan name/status).
- Usage meters still call the API when available; plan tier does not depend on Render.

## 3. Checkout

Always upgrade from **Console → Billing → Upgrade** so `org_id` and `plan` are in Creem metadata.

## 4. Verify in Supabase

After a test payment:

1. Table **`org_plans`** — `plan_id` should be `personal` (etc.), Creem ids filled in.
2. Table **`profiles`** — `billing_org_id` should point at your workspace org.
3. View **`my_profile`** — shows `subscription_plan_id`, `creem_subscription_status`.

## 5. Fix a missed payment

Creem → Webhooks → resend `subscription.paid` or `checkout.completed` to the **Supabase** URL (not Render).

Or SQL (service role / SQL editor):

```sql
update org_plans set plan_id = 'personal', creem_subscription_status = 'active', billing_status = 'active'
where org_id = 'personal-xxxxxxxx';
```

## Render (optional)

You can remove `CREEM_WEBHOOK_SECRET` from Render or leave the old `/v1/billing/webhook` unused. Do not register both URLs in Creem (duplicate updates).
