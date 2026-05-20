-- Enable Supabase Realtime for the alerts table so the dashboard
-- receives instant INSERT events without polling.
alter table public.alerts replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;
end$$;
