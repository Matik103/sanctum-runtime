-- Persists notification deduplication state so cooldowns survive API restarts.
-- The API queries this on startup to repopulate its in-memory cache.

create table if not exists public.notification_dedup_log (
  org_id      text        not null,
  event_type  text        not null,
  last_sent_at timestamptz not null default now(),
  primary key (org_id, event_type)
);

-- Service role only — never user-facing
alter table public.notification_dedup_log enable row level security;

create policy "Service role manages dedup log"
  on public.notification_dedup_log
  for all
  using (auth.role() = 'service_role');

-- Auto-clean entries older than 7 days (well beyond any cooldown window)
create index if not exists notification_dedup_log_last_sent_idx
  on public.notification_dedup_log (last_sent_at);
