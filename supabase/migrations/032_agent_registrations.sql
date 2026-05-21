-- Agent registrations: signed identity tokens for agents
-- Instead of self-reporting org_id in every request body (trust inversion),
-- agents authenticate with a signed token issued at registration time.
-- The API extracts org_id from the verified token, ignoring context.org_id.

create table if not exists agent_registrations (
  id           uuid        primary key default gen_random_uuid(),
  org_id       text        not null,
  name         text        not null,
  description  text,
  token_hint   text        not null,  -- last 6 chars shown in UI for identification
  created_by   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  revoked_by   text
);

create index if not exists agent_registrations_org_active
  on agent_registrations (org_id, created_at desc)
  where revoked_at is null;

alter table agent_registrations enable row level security;

create policy "org members read agent registrations"
  on agent_registrations for select
  using (
    org_id in (
      select org_id from public.organization_members where user_id = auth.uid()
    )
  );

create policy "service role full access"
  on agent_registrations for all
  to service_role
  using (true)
  with check (true);
