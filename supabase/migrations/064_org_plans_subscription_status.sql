-- Creem subscription visibility for billing UI and Supabase audits.

alter table public.org_plans
  add column if not exists creem_subscription_status text,
  add column if not exists billing_status text not null default 'active';

comment on column public.org_plans.creem_subscription_status is
  'Last Creem subscription status (active, trialing, canceled, past_due, scheduled_cancel, etc.)';
comment on column public.org_plans.billing_status is
  'Sanctum billing health: active | payment_failed | canceled';
