-- Enable Supabase Realtime for audit_events so the Live Feed page receives
-- instant INSERT events when proxy tool calls are logged.
alter table public.audit_events replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'audit_events'
  ) then
    alter publication supabase_realtime add table public.audit_events;
  end if;
end$$;

-- Optional: partial index for efficient proxy event queries
create index if not exists idx_audit_events_proxy
  on public.audit_events ((context->>'proxy'))
  where context->>'proxy' = 'true';
