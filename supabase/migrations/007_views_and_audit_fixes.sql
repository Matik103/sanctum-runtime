-- Views + audit indexes for dashboard queries

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

create index if not exists audit_events_decision_idx
  on public.audit_events (decision, created_at desc);

-- Pending human review (dashboard queue)
create or replace view public.pending_verifications as
select
  id,
  correlation_id,
  org_id,
  actor,
  action,
  decision,
  risk,
  reasoning,
  human_record,
  payload,
  created_at
from public.audit_events
where decision = 'REQUIRE_VERIFICATION'
  and resolved_at is null
order by created_at desc;

comment on view public.pending_verifications is 'Open verification queue for operators';

grant select on public.pending_verifications to authenticated;
grant select on public.pending_verifications to service_role;

-- Profiles updated_at trigger (column exists from 001_profiles)
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
