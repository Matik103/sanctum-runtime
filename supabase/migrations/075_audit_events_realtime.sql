-- Enable Supabase Realtime for audit_events (Connect Live Feed + held queue).
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
