-- Security Advisor 0010: views must use security_invoker so queries run as the
-- caller and respect RLS on underlying tables (profiles, org_plans, audit_events).

drop view if exists public.my_profile;

create view public.my_profile
  with (security_invoker = on)
as
select
  p.id,
  p.email,
  p.display_name,
  p.portal_type,
  p.auth_provider,
  p.job_title,
  p.country_code,
  p.accepted_terms_at,
  p.terms_version,
  p.billing_org_id,
  op.plan_id as subscription_plan_id,
  op.creem_subscription_status,
  op.billing_status,
  op.creem_subscription_id,
  p.last_sign_in_at,
  p.created_at,
  p.updated_at
from public.profiles p
left join public.org_plans op on op.org_id = p.billing_org_id
where p.id = auth.uid();

grant select on public.my_profile to authenticated;

comment on view public.my_profile is 'Current user profile with linked billing workspace plan (read-only)';

drop view if exists public.pending_verifications;

create view public.pending_verifications
  with (security_invoker = on)
as
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

grant select on public.pending_verifications to authenticated;
grant select on public.pending_verifications to service_role;

comment on view public.pending_verifications is 'Open verification queue for operators';
