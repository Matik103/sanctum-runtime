-- Product-facing free tier label.
-- Keep the stable entitlement id (`observer`) for compatibility, but present
-- it as Developer and keep it observe-only.

update public.plans
set
  name = 'Developer',
  price_monthly_usd = null,
  max_events_per_month = 0,
  max_governed_actions_per_month = 0,
  max_observe_events_per_month = null,
  features = '["connect","live_feed","observe_mode","basic_dashboard","community_support"]'::jsonb
where id = 'observer';

alter table public.org_plans
  alter column plan_id set default 'observer';
