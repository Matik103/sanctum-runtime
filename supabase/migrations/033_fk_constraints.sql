-- Add missing FK constraints to tables created in 031 and 032.
-- These were omitted in the original migrations and allow orphaned rows.

alter table public.policy_grants
  add constraint policy_grants_org_id_fkey
  foreign key (org_id) references public.organizations (id) on delete cascade;

alter table public.agent_registrations
  add constraint agent_registrations_org_id_fkey
  foreign key (org_id) references public.organizations (id) on delete cascade;
