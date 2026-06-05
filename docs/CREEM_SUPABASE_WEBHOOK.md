# Creem billing via Supabase (recommended)

> **Full secret list (API key + product IDs):** [CREEM_SUPABASE.md](./CREEM_SUPABASE.md)

Use this **instead of** pointing Creem at the Render API. One webhook → one database update.

## Flow

```text
User pays on Creem
    → Creem POST webhook
    → Supabase Edge Function `creem-webhook`
    → Updates `org_plans` + `profiles.billing_org_id`
    → Console reads plan from Supabase (RLS)
```

Checkout uses **`creem-checkout`** Edge Function (`CREEM_API_KEY` + product IDs in Supabase secrets). Render is not required for billing.

## 1. Deploy the Edge Function

```bash
./scripts/set-creem-supabase-secrets.sh
# or set manually — see CREEM_SUPABASE.md

supabase functions deploy creem-webhook --no-verify-jwt
supabase functions deploy creem-checkout
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
