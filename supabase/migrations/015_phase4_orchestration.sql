-- Phase 4: deployment groups, regions, and runtime command dispatch

create table if not exists public.deployment_groups (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  name text not null,
  region text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists deployment_groups_org_id_idx
  on public.deployment_groups (org_id);

alter table public.registered_runtimes
  add column if not exists deployment_group_id uuid
    references public.deployment_groups (id) on delete set null;

alter table public.registered_runtimes
  add column if not exists region text;

create index if not exists registered_runtimes_region_idx
  on public.registered_runtimes (org_id, region);

create index if not exists registered_runtimes_group_idx
  on public.registered_runtimes (deployment_group_id);

create table if not exists public.runtime_commands (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  runtime_id uuid references public.registered_runtimes (id) on delete cascade,
  deployment_group_id uuid references public.deployment_groups (id) on delete cascade,
  region text,
  command text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'acked', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acked_at timestamptz,
  constraint runtime_commands_target check (
    runtime_id is not null
    or deployment_group_id is not null
    or region is not null
  )
);

create index if not exists runtime_commands_pending_idx
  on public.runtime_commands (runtime_id, status)
  where status = 'pending';

create index if not exists runtime_commands_org_created_idx
  on public.runtime_commands (org_id, created_at desc);

drop trigger if exists deployment_groups_set_updated_at on public.deployment_groups;
create trigger deployment_groups_set_updated_at
  before update on public.deployment_groups
  for each row
  execute function public.set_updated_at();

alter table public.deployment_groups enable row level security;
alter table public.runtime_commands enable row level security;

create policy "deployment_groups_select_org_member"
  on public.deployment_groups for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = deployment_groups.org_id and m.user_id = auth.uid()
    )
  );

create policy "runtime_commands_select_org_member"
  on public.runtime_commands for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = runtime_commands.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.deployment_groups is 'Logical fleet clusters (factory A, security robots, …)';
comment on table public.runtime_commands is 'Orchestration commands delivered to runtimes on heartbeat';
