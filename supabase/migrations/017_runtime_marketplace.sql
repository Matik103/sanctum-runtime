-- Phase 4: runtime marketplace (catalog + org installs)

create table if not exists public.runtime_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  version text not null default '1.0.0',
  publisher text not null default 'sanctum',
  category text not null default 'general',
  visibility text not null default 'public'
    check (visibility in ('public', 'org')),
  org_id text references public.organizations (id) on delete cascade,
  connect_defaults jsonb not null default '{}'::jsonb,
  policy_templates jsonb not null default '[]'::jsonb,
  readme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_packages_org_visibility check (
    (visibility = 'public' and org_id is null)
    or (visibility = 'org' and org_id is not null)
  )
);

create index if not exists runtime_packages_visibility_idx
  on public.runtime_packages (visibility, category);

create table if not exists public.runtime_package_installs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  package_id uuid not null references public.runtime_packages (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  unique (org_id, package_id)
);

create index if not exists runtime_package_installs_org_idx
  on public.runtime_package_installs (org_id);

drop trigger if exists runtime_packages_set_updated_at on public.runtime_packages;
create trigger runtime_packages_set_updated_at
  before update on public.runtime_packages
  for each row
  execute function public.set_updated_at();

alter table public.runtime_packages enable row level security;
alter table public.runtime_package_installs enable row level security;

create policy "runtime_packages_select_public_or_org"
  on public.runtime_packages for select
  using (
    visibility = 'public'
    or (
      org_id is not null
      and exists (
        select 1 from public.organization_members m
        where m.org_id = runtime_packages.org_id and m.user_id = auth.uid()
      )
    )
  );

create policy "runtime_package_installs_select_org_member"
  on public.runtime_package_installs for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = runtime_package_installs.org_id and m.user_id = auth.uid()
    )
  );

-- Curated starter catalog (idempotent)
insert into public.runtime_packages (slug, name, description, version, publisher, category, visibility, connect_defaults, policy_templates, readme)
values
  (
    'sanctum-agent-host',
    'Sanctum Agent Host',
    'General-purpose AI agent runtime — connect, register agents, and gate tool use with org policies.',
    '1.0.0',
    'sanctum',
    'agent-host',
    'public',
    '{"mode":"cloud","region":"us-east","metadata":{"package":"sanctum-agent-host"},"suggestedRuntimeName":"agent-host-01","agents":[{"id":"default_agent","model":"gpt-4o-mini","permissions":["read","verify","send_email"]}]}'::jsonb,
    '[{"action":"send_email","requiresVerification":true},{"action":"delete_file","requiresVerification":true},{"action":"execute_terminal","autoBlock":true},{"action":"access_database","requiresVerification":true,"blockWhenOffline":true}]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''sanctum-agent-host'', orgId). 3. verifyAction with actor default_agent.'
  ),
  (
    'warehouse-robot',
    'Warehouse Robot',
    'Warehouse AMR template — edge mode, navigation agent, movement and door policies.',
    '1.0.0',
    'sanctum',
    'robotics',
    'public',
    '{"mode":"edge","region":"us-west","metadata":{"package":"warehouse-robot"},"suggestedRuntimeName":"warehouse-bot-01","agents":[{"id":"navigation","model":"gpt-4o","permissions":["movement","camera_access"]}]}'::jsonb,
    '[{"action":"move_robot","requiresVerification":false},{"action":"unlock_door","requiresVerification":true},{"action":"disable_alarm","requiresVerification":true,"blockWhenOffline":true}]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''warehouse-robot'', orgId). 3. Gate moves with action move_robot and actor navigation.'
  ),
  (
    'edge-sensor-gateway',
    'Edge Sensor Gateway',
    'Hybrid IoT gateway — telemetry agent, alarm and offline-sensitive policies.',
    '1.0.0',
    'sanctum',
    'edge',
    'public',
    '{"mode":"hybrid","region":"edge-local","metadata":{"package":"edge-sensor-gateway"},"suggestedRuntimeName":"sensor-gw-01","agents":[{"id":"telemetry","model":"gpt-4o-mini","permissions":["read"]}]}'::jsonb,
    '[{"action":"disable_alarm","requiresVerification":true,"blockWhenOffline":true},{"action":"access_database","requiresVerification":true,"blockWhenOffline":true}]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''edge-sensor-gateway'', orgId). 3. emitEvent from agent telemetry.'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  connect_defaults = excluded.connect_defaults,
  policy_templates = excluded.policy_templates,
  readme = excluded.readme,
  updated_at = now();

comment on table public.runtime_packages is 'Marketplace catalog of runtime templates';
comment on table public.runtime_package_installs is 'Org installs of marketplace packages';
