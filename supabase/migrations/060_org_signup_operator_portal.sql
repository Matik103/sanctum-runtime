-- Self-serve "Register organization" is an operator-owned workspace, not domain SSO.
-- Align handle_new_user with dashboard signup metadata (portal_type: operator).

update public.profiles p
set portal_type = 'operator', updated_at = now()
from auth.users u
where p.id = u.id
  and lower(coalesce(u.raw_user_meta_data->>'signup_type', '')) = 'organization'
  and p.portal_type = 'enterprise';

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  portal text;
  provider text;
  signup text;
  contact_name text;
begin
  signup := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'signup_type'), ''), 'individual'));
  if signup not in ('individual', 'organization') then
    signup := 'individual';
  end if;

  if signup = 'organization' then
    portal := coalesce(nullif(trim(new.raw_user_meta_data->>'portal_type'), ''), 'operator');
  else
    portal := coalesce(nullif(trim(new.raw_user_meta_data->>'portal_type'), ''), 'operator');
  end if;
  if portal not in ('operator', 'enterprise') then
    portal := 'operator';
  end if;

  provider := coalesce(
    nullif(trim(new.raw_user_meta_data->>'auth_provider'), ''),
    nullif(trim(new.raw_app_meta_data->>'provider'), ''),
    case when new.email is not null then 'email' else null end
  );

  contact_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'primary_contact_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (id, email, display_name, portal_type, auth_provider)
  values (new.id, new.email, contact_name, portal, provider)
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    portal_type = excluded.portal_type,
    auth_provider = excluded.auth_provider,
    updated_at = now();

  return new;
end;
$$;

-- Do not treat self-serve org owners as domain SSO join candidates.
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
  signup text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select lower(coalesce(nullif(trim(u.raw_user_meta_data->>'signup_type'), ''), ''))
  into signup
  from auth.users u
  where u.id = uid;

  if signup = 'organization' then
    return null;
  end if;

  select portal_type into current_portal from public.profiles where id = uid;

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
