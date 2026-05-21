-- Composite index for audit_events filtered by both org and decision (GDPR/compliance queries)
create index if not exists audit_events_org_decision_idx
  on public.audit_events (org_id, decision, created_at desc);

-- Email retry queue: stores failed outbound emails for background retry
create table if not exists email_queue (
  id            uuid        primary key default gen_random_uuid(),
  org_id        text,
  recipient     text        not null,
  subject       text        not null,
  html          text        not null,
  text_body     text        not null,
  attempt_count int         not null default 0,
  last_error    text,
  next_attempt_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists email_queue_pending
  on email_queue (next_attempt_at)
  where sent_at is null;

alter table email_queue enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'email_queue' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access"
      on email_queue for all to service_role
      using (true) with check (true);
  end if;
end $$;
