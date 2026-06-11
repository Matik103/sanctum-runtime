-- Fix infinite recursion in organization_members RLS (42P17) exposed when
-- my_profile switched to security_invoker (066): org_plans policies query
-- organization_members, which had a self-referential SELECT policy.

create or replace function public.current_user_org_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.organization_members where user_id = auth.uid();
$$;

revoke all on function public.current_user_org_ids() from public;
grant execute on function public.current_user_org_ids() to authenticated;

drop policy if exists "org_members_select_same_org" on public.organization_members;

create policy "org_members_select_same_org"
  on public.organization_members for select
  using (org_id in (select public.current_user_org_ids()));

-- Allow reading plan row linked from profiles.billing_org_id even when membership
-- differs (checkout/webhook linkage).
create policy "org_plans_select_billing_profile"
  on public.org_plans for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.billing_org_id = org_plans.org_id
    )
  );

comment on function public.current_user_org_ids() is
  'Org ids for auth.uid(); security definer to avoid RLS recursion in member policies';
