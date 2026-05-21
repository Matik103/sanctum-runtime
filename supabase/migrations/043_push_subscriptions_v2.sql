-- Push notification subscriptions (FCM device tokens per user/org)
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       text not null,
  fcm_token    text not null,
  device_name  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, fcm_token)
);

create index if not exists push_subscriptions_org_idx on public.push_subscriptions(org_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow service role (used by API) to read all tokens for an org
create policy "Service role can read push subscriptions"
  on public.push_subscriptions
  for select
  using (auth.role() = 'service_role');

-- Add 'push' as a valid alert channel
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
