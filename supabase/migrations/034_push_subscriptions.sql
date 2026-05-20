-- Browser push notification subscriptions (Web Push API / VAPID)
-- Each browser/device that opts in gets a row here.
-- The endpoint + keys are the browser's push service coordinates.

create table if not exists public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  org_id       text        not null references public.organizations (id) on delete cascade,
  user_id      uuid        references auth.users (id) on delete cascade,
  endpoint     text        not null unique,
  p256dh       text        not null,  -- browser public key
  auth_key     text        not null,  -- auth secret
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_org_idx
  on public.push_subscriptions (org_id);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users see own push subscriptions" on public.push_subscriptions;
drop policy if exists "service role full access" on public.push_subscriptions;

create policy "users see own push subscriptions"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "service role full access"
  on public.push_subscriptions for all
  to service_role
  using (true)
  with check (true);

comment on table public.push_subscriptions is 'Web Push API VAPID subscription endpoints per browser session';
