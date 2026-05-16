-- Audit events mirror (optional — API syncs when SUPABASE_* is set in .env)

create table if not exists public.audit_events (
  id uuid primary key,
  correlation_id text not null,
  org_id text,
  actor text not null,
  action text not null,
  decision text not null,
  risk text,
  reasoning text,
  human_record text,
  human_resolution text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists audit_events_correlation_id_idx
  on public.audit_events (correlation_id);

create index if not exists audit_events_org_id_created_at_idx
  on public.audit_events (org_id, created_at desc);

alter table public.audit_events enable row level security;

-- Service role bypasses RLS; authenticated users read own org when org_id matches JWT claim
create policy "audit_select_org"
  on public.audit_events for select
  using (
    org_id is null
    or org_id = coalesce(auth.jwt() ->> 'org_id', auth.jwt() ->> 'orgId')
  );

-- Inserts/updates only via service role (API), not from browser clients
create policy "audit_no_client_write"
  on public.audit_events for insert
  with check (false);

create policy "audit_no_client_update"
  on public.audit_events for update
  using (false);
