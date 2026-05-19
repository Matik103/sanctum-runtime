-- Time-bounded approval grants
-- When an operator approves an action, they can grant it for a duration
-- so the agent doesn't re-ask on every call during that window.

create table if not exists policy_grants (
  id          uuid        primary key default gen_random_uuid(),
  org_id      text        not null,
  action      text        not null,
  actor       text,                    -- null = applies to any actor in this org
  granted_by  text        not null,    -- user id or 'email-link'
  duration_minutes integer not null default 30,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  text
);

-- Fast lookup for active grants at decision time
create index if not exists policy_grants_active_lookup
  on policy_grants (org_id, action, expires_at)
  where revoked_at is null;

alter table policy_grants enable row level security;

-- Org members can read their own grants
create policy "org members read grants"
  on policy_grants for select
  using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid()
    )
  );

-- Service role has full access (used by API)
create policy "service role full access"
  on policy_grants for all
  to service_role
  using (true)
  with check (true);
