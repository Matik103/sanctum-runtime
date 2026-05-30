-- Connect Agent gap-fill: tool registry, settings extensions, credential environments.

create table if not exists public.connect_tools (
  id              uuid        primary key default gen_random_uuid(),
  org_id          text        not null references public.organizations (id) on delete cascade,
  agent_id        uuid        references public.agent_registrations (id) on delete set null,
  action          text        not null,
  description     text,
  parameters_schema jsonb,
  platform        text,
  seen_count      integer     not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (org_id, action)
);

create index if not exists connect_tools_org_action on public.connect_tools (org_id, action);

alter table public.connect_tools enable row level security;

drop policy if exists "org members read connect tools" on public.connect_tools;
create policy "org members read connect tools"
  on public.connect_tools for select
  using (public.is_org_member(org_id));

drop policy if exists "no client write connect tools" on public.connect_tools;
create policy "no client write connect tools"
  on public.connect_tools for insert with check (false);
drop policy if exists "no client update connect tools" on public.connect_tools;
create policy "no client update connect tools"
  on public.connect_tools for update using (false);
drop policy if exists "no client delete connect tools" on public.connect_tools;
create policy "no client delete connect tools"
  on public.connect_tools for delete using (false);

alter table public.connect_org_settings
  add column if not exists enforce_action_token boolean not null default false,
  add column if not exists connect_webhook_url text,
  add column if not exists credential_environment text not null default 'production'
    check (credential_environment in ('development', 'staging', 'production'));

alter table public.platform_credentials
  add column if not exists environment text not null default 'production'
    check (environment in ('development', 'staging', 'production'));

alter table public.platform_credentials drop constraint if exists platform_credentials_org_platform_unique;
create unique index if not exists platform_credentials_org_platform_env
  on public.platform_credentials (org_id, platform, environment);

comment on table public.connect_tools is
  'Tool names/schemas seen via Connect proxy — drives policy suggestions.';
