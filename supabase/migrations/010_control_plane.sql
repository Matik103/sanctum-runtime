-- Control plane: runtime registry, agents, event stream (Phase 1 MVP)

create table if not exists public.registered_runtimes (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  name text not null,
  fingerprint text not null,
  mode text not null default 'cloud'
    check (mode in ('cloud', 'edge', 'airgap', 'hybrid')),
  status text not null default 'offline'
    check (status in ('online', 'offline', 'degraded')),
  trust_score numeric(5, 2) not null default 100,
  current_task text,
  active_model text,
  metadata jsonb not null default '{}'::jsonb,
  telemetry jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fingerprint)
);

create index if not exists registered_runtimes_org_id_idx
  on public.registered_runtimes (org_id);

create index if not exists registered_runtimes_last_seen_idx
  on public.registered_runtimes (last_seen_at desc);

create table if not exists public.registered_agents (
  id uuid primary key default gen_random_uuid(),
  runtime_id uuid not null references public.registered_runtimes (id) on delete cascade,
  agent_id text not null,
  model text,
  permissions jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'idle', 'stopped')),
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (runtime_id, agent_id)
);

create index if not exists registered_agents_runtime_id_idx
  on public.registered_agents (runtime_id);

create table if not exists public.runtime_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  runtime_id uuid references public.registered_runtimes (id) on delete set null,
  agent_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists runtime_events_org_created_idx
  on public.runtime_events (org_id, created_at desc);

create index if not exists runtime_events_runtime_idx
  on public.runtime_events (runtime_id, created_at desc);

create index if not exists runtime_events_type_idx
  on public.runtime_events (event_type, created_at desc);

drop trigger if exists registered_runtimes_set_updated_at on public.registered_runtimes;
create trigger registered_runtimes_set_updated_at
  before update on public.registered_runtimes
  for each row
  execute function public.set_updated_at();

drop trigger if exists registered_agents_set_updated_at on public.registered_agents;
create trigger registered_agents_set_updated_at
  before update on public.registered_agents
  for each row
  execute function public.set_updated_at();

alter table public.registered_runtimes enable row level security;
alter table public.registered_agents enable row level security;
alter table public.runtime_events enable row level security;

create policy "runtimes_select_org_member"
  on public.registered_runtimes for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = registered_runtimes.org_id and m.user_id = auth.uid()
    )
  );

create policy "agents_select_via_runtime"
  on public.registered_agents for select
  using (
    exists (
      select 1
      from public.registered_runtimes r
      join public.organization_members m on m.org_id = r.org_id
      where r.id = registered_agents.runtime_id and m.user_id = auth.uid()
    )
  );

create policy "runtime_events_select_org_member"
  on public.runtime_events for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = runtime_events.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.registered_runtimes is 'Edge/agent hosts registered with Sanctum control plane';
comment on table public.registered_agents is 'AI agents bound to a registered runtime';
comment on table public.runtime_events is 'Telemetry and audit event stream (agent.started, policy.blocked, …)';
