-- Connect Agent org settings (proxy mode, wait behavior, tool-result gating).

create table if not exists public.connect_org_settings (
  org_id                  text        primary key references public.organizations (id) on delete cascade,
  proxy_mode              text        not null default 'gate'
    check (proxy_mode in ('gate', 'observe')),
  wait_verification       boolean     not null default true,
  wait_timeout_ms         integer     not null default 120000
    check (wait_timeout_ms >= 5000 and wait_timeout_ms <= 600000),
  gate_tool_results       boolean     not null default true,
  redact_tool_arguments   boolean     not null default false,
  notify_on_hold          boolean     not null default true,
  applied_policy_preset   text,
  updated_at              timestamptz not null default now()
);

alter table public.connect_org_settings enable row level security;

drop policy if exists "org members read connect settings" on public.connect_org_settings;
create policy "org members read connect settings"
  on public.connect_org_settings for select
  using (public.is_org_member(org_id));

drop policy if exists "no client write connect settings" on public.connect_org_settings;
create policy "no client write connect settings"
  on public.connect_org_settings for insert
  with check (false);

drop policy if exists "no client update connect settings" on public.connect_org_settings;
create policy "no client update connect settings"
  on public.connect_org_settings for update
  using (false);

drop policy if exists "no client delete connect settings" on public.connect_org_settings;
create policy "no client delete connect settings"
  on public.connect_org_settings for delete
  using (false);

comment on table public.connect_org_settings is
  'Org-level Connect Agent proxy behavior (API service role writes only).';
