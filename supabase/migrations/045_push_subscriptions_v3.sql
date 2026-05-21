-- Web Push subscriptions for Sanctum Mobile Companion (PWA)

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Browser push endpoints for PWA companion (verification alerts, threat blocks)';

alter table public.push_subscriptions enable row level security;

-- API uses service role; no direct client access
create policy "push_subscriptions_service_only"
  on public.push_subscriptions
  for all
  using (false)
  with check (false);
