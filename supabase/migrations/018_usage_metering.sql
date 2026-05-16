-- Phase 4: usage metering (billing precursor)

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  metric text not null,
  quantity numeric(12, 4) not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists usage_events_org_metric_time_idx
  on public.usage_events (org_id, metric, recorded_at desc);

create index if not exists usage_events_recorded_at_idx
  on public.usage_events (recorded_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events_select_org_member"
  on public.usage_events for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = usage_events.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.usage_events is 'Metered control-plane usage per org (billing precursor)';
