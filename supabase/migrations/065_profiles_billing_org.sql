-- Link each user profile to the workspace that owns Creem billing / entitlements.

alter table public.profiles
  add column if not exists billing_org_id text references public.organizations (id) on delete set null;

create index if not exists profiles_billing_org_id_idx on public.profiles (billing_org_id);

comment on column public.profiles.billing_org_id is
  'Workspace org_id used for plan entitlements and Creem subscription (set on checkout/webhook).';

drop view if exists public.my_profile;

create view public.my_profile as
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

-- Backfill billing workspace for existing users (personal workspace first).
update public.profiles p
set billing_org_id = sub.org_id
from (
  select distinct on (m.user_id)
    m.user_id,
    m.org_id
  from public.organization_members m
  order by
    m.user_id,
    case when m.org_id like 'personal-%' then 0 else 1 end,
    m.org_id
) sub
where p.id = sub.user_id
  and p.billing_org_id is null;
