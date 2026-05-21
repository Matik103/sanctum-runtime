-- Consolidate push_subscriptions schema.
--
-- Migrations 041, 043, and 045 all CREATE TABLE IF NOT EXISTS the same
-- table with three different shapes, so only the first applied wins and
-- the live schema in Supabase does not match what apps/api/src/push-routes.ts
-- actually reads and writes (it expects user_id + endpoint + subscription jsonb).
--
-- This migration drops whatever is there and rebuilds the canonical shape.
-- Acceptable to drop because no production device has been able to
-- successfully subscribe yet (the dashboard hook was missing auth headers
-- until d38da0d).

drop table if exists public.push_subscriptions cascade;

create table public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  endpoint     text        not null,
  subscription jsonb       not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web Push API (VAPID) endpoints per user device for PWA mitigation alerts';

alter table public.push_subscriptions enable row level security;

-- The API uses the service role to read/write rows on behalf of authenticated
-- users (auth check happens in the Fastify route, not the DB). Direct
-- client access is disabled.
create policy "push_subscriptions_service_only"
  on public.push_subscriptions
  for all
  using (false)
  with check (false);

-- Ensure 'push' is a valid alert channel (idempotent — safe to re-run)
do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'alert_channel'
  ) then
    alter type alert_channel add value if not exists 'push';
  end if;
end $$;
