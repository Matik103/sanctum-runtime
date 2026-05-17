-- Billing: plan definitions and org-to-plan mapping

create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_monthly_usd numeric(10, 2),
  max_runtimes integer,          -- null = unlimited
  max_events_per_month bigint,   -- null = unlimited
  max_agents integer,            -- null = unlimited
  retention_days integer not null default 7,
  features jsonb not null default '[]'::jsonb
);

insert into public.plans (id, name, price_monthly_usd, max_runtimes, max_events_per_month, max_agents, retention_days, features) values
  ('free',       'Developer',  null,  3,    10000,     5,    7,  '["basic_dashboard","community_support"]'),
  ('operator',   'Operator',   49,    25,   500000,    10,   14, '["live_telemetry","runtime_health","api_access","alerts","cloud_sync"]'),
  ('team',       'Team',       299,   250,  10000000,  50,   30, '["sso","rbac","alerts","audit_logs","advanced_fleet","webhooks"]'),
  ('enterprise', 'Enterprise', null,  null, null,      null, 90, '["everything","air_gap","private_cloud","sla","dedicated_support","compliance","encrypted_memory"]')
on conflict (id) do nothing;

create table if not exists public.org_plans (
  org_id text primary key references public.organizations (id) on delete cascade,
  plan_id text not null references public.plans (id) default 'free',
  paddle_subscription_id text,
  paddle_customer_id text,
  trial_ends_at timestamptz,
  billing_cycle_anchor timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_plans enable row level security;

create policy "org_plans_select_member"
  on public.org_plans for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = org_plans.org_id and m.user_id = auth.uid()
    )
  );

create policy "org_plans_update_owner"
  on public.org_plans for update
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = org_plans.org_id and m.user_id = auth.uid() and m.role = 'owner'
    )
  );

-- Auto-assign free plan when a new org is created
create or replace function public.assign_free_plan()
  returns trigger language plpgsql security definer as $$
begin
  insert into public.org_plans (org_id, plan_id)
  values (new.id, 'free')
  on conflict (org_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_assign_free_plan on public.organizations;
create trigger trg_assign_free_plan
  after insert on public.organizations
  for each row execute function public.assign_free_plan();

-- Back-fill existing orgs
insert into public.org_plans (org_id, plan_id)
  select id, 'free' from public.organizations
  on conflict (org_id) do nothing;

comment on table public.plans     is 'Static billing plan definitions';
comment on table public.org_plans is 'Per-org plan subscription and Paddle references';
