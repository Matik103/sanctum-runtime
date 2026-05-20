-- After Enterprise SSO, ensure portal_type is enterprise and domain-mapped org membership exists.
-- (Profile insert may run before OAuth metadata is applied.)

create or replace function public.bootstrap_enterprise_org_for_user ()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  domain_part text;
  matched_org text;
  current_portal text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select portal_type into current_portal from public.profiles where id = uid;

  -- Only run domain join for enterprise portal (or when metadata was just set).
  if current_portal is distinct from 'enterprise' then
    update public.profiles
    set portal_type = 'enterprise', updated_at = now()
    where id = uid
      and coalesce(
        (select nullif(trim(raw_user_meta_data->>'portal_type'), '') from auth.users where id = uid),
        ''
      ) = 'enterprise';
    select portal_type into current_portal from public.profiles where id = uid;
  end if;

  if current_portal is distinct from 'enterprise' then
    return null;
  end if;

  select u.email into user_email from auth.users u where u.id = uid;
  if user_email is null then
    return null;
  end if;

  domain_part := lower(split_part(user_email, '@', 2));

  select d.org_id into matched_org
  from public.organization_domains d
  where lower(d.domain) = domain_part
    and d.verified = true
  limit 1;

  if matched_org is null then
    return null;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (matched_org, uid, 'member')
  on conflict (org_id, user_id) do nothing;

  return matched_org;
end;
$$;

grant execute on function public.bootstrap_enterprise_org_for_user () to authenticated;

comment on function public.bootstrap_enterprise_org_for_user is
  'Enterprise SSO: join current user to org by verified email domain';
