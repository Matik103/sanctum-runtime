-- Pricing v2: Observer (free adoption) -> Personal -> Operator -> Team -> Enterprise
-- Meter observe (read) separately from governed (verify/gate) actions.

alter table public.plans
  add column if not exists max_observe_events_per_month bigint,
  add column if not exists max_governed_actions_per_month bigint;

comment on column public.plans.max_observe_events_per_month is 'Live feed / Connect observe events per month; null = unlimited';
comment on column public.plans.max_governed_actions_per_month is 'Policy verifications and gated proxy actions per month; null = unlimited';

-- Backfill governed from legacy max_events_per_month
update public.plans
set max_governed_actions_per_month = max_events_per_month
where max_governed_actions_per_month is null and max_events_per_month is not null;

-- Observer (replaces Developer free tier)
insert into public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) values (
  'observer', 'Observer', null,
  3, null, 2, 7,
  null, 0,
  '["connect","live_feed","observe_mode","basic_dashboard","community_support"]'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  price_monthly_usd = excluded.price_monthly_usd,
  max_runtimes = excluded.max_runtimes,
  max_events_per_month = excluded.max_events_per_month,
  max_agents = excluded.max_agents,
  retention_days = excluded.retention_days,
  max_observe_events_per_month = excluded.max_observe_events_per_month,
  max_governed_actions_per_month = excluded.max_governed_actions_per_month,
  features = excluded.features;

-- Personal: taste of control
insert into public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) values (
  'personal', 'Personal', 12,
  5, null, 5, 30,
  null, 500,
  '["connect","live_feed","observe_mode","light_gates","weekly_digest","basic_dashboard","email_alerts"]'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  price_monthly_usd = excluded.price_monthly_usd,
  max_runtimes = excluded.max_runtimes,
  max_events_per_month = excluded.max_events_per_month,
  max_agents = excluded.max_agents,
  retention_days = excluded.retention_days,
  max_observe_events_per_month = excluded.max_observe_events_per_month,
  max_governed_actions_per_month = excluded.max_governed_actions_per_month,
  features = excluded.features;

-- Operator: production control (governed meter)
update public.plans set
  name = 'Operator',
  price_monthly_usd = 59,
  max_runtimes = 25,
  max_events_per_month = null,
  max_agents = 10,
  retention_days = 30,
  max_observe_events_per_month = null,
  max_governed_actions_per_month = 500000,
  features = '["connect","live_feed","shield_rules","webhooks","live_telemetry","runtime_health","api_access","alerts","cloud_sync","holds_approve"]'::jsonb
where id = 'operator';

-- Team
update public.plans set
  max_events_per_month = null,
  max_observe_events_per_month = null,
  max_governed_actions_per_month = 10000000,
  features = '["connect","live_feed","shield_rules","sso","rbac","alerts","audit_logs","advanced_fleet","webhooks","compliance_export"]'::jsonb
where id = 'team';

-- Enterprise
update public.plans set
  max_events_per_month = null,
  max_observe_events_per_month = null,
  max_governed_actions_per_month = null,
  features = '["everything","air_gap","private_cloud","sla","dedicated_support","compliance","encrypted_memory"]'::jsonb
where id = 'enterprise';

-- Migrate orgs on legacy Developer plan
update public.org_plans set plan_id = 'observer' where plan_id = 'free';

-- New orgs default to Observer
create or replace function public.assign_free_plan()
  returns trigger language plpgsql security definer as $$
begin
  insert into public.org_plans (org_id, plan_id)
  values (new.id, 'observer')
  on conflict (org_id) do nothing;
  return new;
end;
$$;

-- Keep legacy row for FK safety but hide from new signups (optional reference only)
update public.plans set
  name = 'Developer (legacy)',
  max_governed_actions_per_month = 50,
  max_observe_events_per_month = null
where id = 'free';
