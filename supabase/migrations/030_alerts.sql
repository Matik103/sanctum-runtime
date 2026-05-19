-- Persistent alert history and configurable alert rules

-- ── alerts ────────────────────────────────────────────────────────────────────

create table if not exists public.alerts (
  id               uuid        primary key default gen_random_uuid(),
  org_id           text        not null references public.organizations (id) on delete cascade,
  runtime_id       text,
  severity         text        not null check (severity in ('info', 'warning', 'critical', 'emergency')),
  type             text        not null,
  title            text        not null,
  message          text        not null,
  status           text        not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  channels         text[]      not null default '{}',
  metadata         jsonb       not null default '{}',
  acknowledged_by  text,
  acknowledged_at  timestamptz,
  resolved_by      text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists alerts_org_created_idx  on public.alerts (org_id, created_at desc);
create index if not exists alerts_org_status_idx   on public.alerts (org_id, status);
create index if not exists alerts_org_severity_idx on public.alerts (org_id, severity);

alter table public.alerts enable row level security;

-- Org members can read alerts for their org
create policy "alerts_member_read"
  on public.alerts for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = alerts.org_id and m.user_id = auth.uid()
    )
  );

-- Org owners/admins can acknowledge and resolve alerts
create policy "alerts_admin_update"
  on public.alerts for update
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = alerts.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Service role handles inserts (no user-facing insert policy needed)

-- ── alert_rules ───────────────────────────────────────────────────────────────

create table if not exists public.alert_rules (
  id             uuid        primary key default gen_random_uuid(),
  org_id         text        not null references public.organizations (id) on delete cascade,
  name           text        not null,
  event_type     text        not null,
  threshold      integer     not null default 1,
  window_minutes integer     not null default 60,
  severity       text        not null check (severity in ('info', 'warning', 'critical', 'emergency')),
  channels       text[]      not null default array['email']::text[],
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.alert_rules enable row level security;

create policy "alert_rules_member_read"
  on public.alert_rules for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = alert_rules.org_id and m.user_id = auth.uid()
    )
  );

create policy "alert_rules_admin_write"
  on public.alert_rules for all
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = alert_rules.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );
