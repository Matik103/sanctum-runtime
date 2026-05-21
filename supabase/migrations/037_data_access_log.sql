-- Data access audit log for GDPR Article 30 (records of processing activities)
-- Captures who read which org's data, from where, and when.
-- Service-role only: members cannot read, modify, or delete these records.

create table if not exists data_access_log (
  id              uuid        primary key default gen_random_uuid(),
  org_id          text        not null,
  actor_user_id   text,
  actor_key_prefix text,
  actor_ip        text,
  resource        text        not null,   -- e.g. 'runtimes', 'agents', 'events'
  resource_id     text,                   -- specific row ID if applicable
  created_at      timestamptz not null default now()
);

-- Indexes for GDPR subject-access requests and retention queries
create index if not exists data_access_log_org_ts    on data_access_log (org_id, created_at desc);
create index if not exists data_access_log_actor     on data_access_log (actor_user_id) where actor_user_id is not null;
create index if not exists data_access_log_ts        on data_access_log (created_at desc);

alter table data_access_log enable row level security;

-- Service role has full access; all other roles are denied
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'data_access_log' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access"
      on data_access_log
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
