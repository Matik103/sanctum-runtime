-- Add a top-level shield_level column to audit_events so Shield threat levels
-- can be queried and indexed directly, without parsing the payload JSONB blob.
--
-- The column is nullable: rows created before Shield was deployed, or by runtimes
-- that run in offline/standalone mode without Shield enabled, remain NULL.
--
-- shield_score is also surfaced as a top-level column for analytics queries
-- (e.g. "show me all actions with a threat score above 60 in the last 30 days").

alter table public.audit_events
  add column if not exists shield_level text
    check (shield_level in ('clear', 'elevated', 'high', 'critical')),
  add column if not exists shield_score  smallint
    check (shield_score between 0 and 100);

comment on column public.audit_events.shield_level is
  'Sanctum Shield assessment level for this action (clear/elevated/high/critical). NULL when Shield was not evaluated.';

comment on column public.audit_events.shield_score is
  'Sanctum Shield numeric threat score 0–100. NULL when Shield was not evaluated.';

-- Partial index: only rows where Shield actually fired something worth querying.
-- Keeps index small — the vast majority of rows will be NULL or clear.
create index if not exists audit_events_shield_level_idx
  on public.audit_events (org_id, shield_level, created_at desc)
  where shield_level is not null and shield_level != 'clear';

-- Separate index for score-range queries (e.g. dashboard analytics, compliance exports).
create index if not exists audit_events_shield_score_idx
  on public.audit_events (org_id, shield_score desc)
  where shield_score is not null and shield_score > 0;
