-- Human inbox, visitor feedback, and support analytics (marketing support agent).

-- Session lifecycle for operator takeover
alter table public.support_agent_sessions
  add column if not exists status text not null default 'bot'
    check (status in ('bot', 'queued', 'human_active', 'resolved')),
  add column if not exists handoff_reason text,
  add column if not exists assigned_operator_id uuid,
  add column if not exists assigned_operator_email text,
  add column if not exists escalated_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists visitor_last_seen_at timestamptz;

create index if not exists idx_support_sessions_inbox
  on public.support_agent_sessions (status, escalated_at desc nulls last, last_message_at desc);

-- Thumbs up/down on assistant replies
create table if not exists public.support_agent_message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_agent_messages(id) on delete cascade,
  session_id uuid not null references public.support_agent_sessions(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now()
);

create unique index if not exists support_feedback_message_once
  on public.support_agent_message_feedback (message_id);

create index if not exists idx_support_feedback_session
  on public.support_agent_message_feedback (session_id, created_at desc);

-- Lightweight analytics events (queries, handoffs, latency, feedback)
create table if not exists public.support_agent_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.support_agent_sessions(id) on delete set null,
  message_id uuid references public.support_agent_messages(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_events_type_created
  on public.support_agent_events (event_type, created_at desc);

create index if not exists idx_support_events_session
  on public.support_agent_events (session_id, created_at desc);

alter table public.support_agent_message_feedback enable row level security;
alter table public.support_agent_events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_agent_message_feedback' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_agent_message_feedback
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_agent_events' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_agent_events
      for all to service_role using (true) with check (true);
  end if;
end $$;

insert into public.support_agent_config (key, value, description)
values (
  'inbox',
  jsonb_build_object(
    'allowed_emails', '[]'::jsonb,
    'notify_email', 'support@sanctumruntime.com',
    'slack_webhook_url', null
  ),
  'Human inbox operators and handoff notification targets'
)
on conflict (key) do nothing;
