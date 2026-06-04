-- Individual vs organization self-serve signup.
-- signup_type in auth user_metadata: 'individual' | 'organization'

-- Optional: primary contact stored on org for compliance / billing
alter table public.organizations
  add column if not exists primary_contact_name text;

comment on column public.organizations.primary_contact_name is
  'Account owner / primary contact at organization signup';

-- Stable org id from display name
create or replace function public.make_org_id_from_name(org_name text)
returns text
language plpgsql
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(trim(coalesce(org_name, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if length(base) < 2 then
    base := 'org';
  end if;
  base := left(base, 48);

  candidate := base;
  while exists (select 1 from public.organizations o where o.id = candidate) loop
    n := n + 1;
    candidate := base || '-' || n::text;
  end loop;

  return candidate;
end;
$$;

-- Profile row from auth.users (restored on insert; 029 had replaced this trigger)
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
    portal := 'enterprise';
  else
    portal := coalesce(nullif(trim(new.raw_user_meta_data->>'portal_type'), ''), 'operator');
    if portal not in ('operator', 'enterprise') then
      portal := 'operator';
    end if;
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

-- Org membership after profile exists
create or replace function public.bootstrap_user_org ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  domain_part text;
  matched_org text;
  personal_org text;
  display text;
  signup text;
  org_name text;
  v_org_id text;
  contact_name text;
  meta jsonb;
begin
  select u.email, u.raw_user_meta_data
  into user_email, meta
  from auth.users u
  where u.id = new.id;

  if user_email is null then
    return new;
  end if;

  signup := lower(coalesce(nullif(trim(meta->>'signup_type'), ''), 'individual'));
  if signup not in ('individual', 'organization') then
    signup := 'individual';
  end if;

  display := coalesce(nullif(trim(new.display_name), ''), split_part(user_email, '@', 1));
  domain_part := lower(split_part(user_email, '@', 2));

  -- Self-serve organization account (email signup)
  if signup = 'organization' then
    org_name := coalesce(nullif(trim(meta->>'organization_name'), ''), 'Organization');
    contact_name := coalesce(nullif(trim(meta->>'primary_contact_name'), ''), display);
    v_org_id := public.make_org_id_from_name(org_name);

    insert into public.organizations (id, name, primary_contact_name)
    values (v_org_id, org_name, contact_name)
    on conflict (id) do nothing;

    insert into public.organization_members (org_id, user_id, role)
    values (v_org_id, new.id, 'owner')
    on conflict (org_id, user_id) do nothing;

    return new;
  end if;

  -- Enterprise SSO: join by verified email domain only
  if new.portal_type = 'enterprise' then
    select d.org_id into matched_org
    from public.organization_domains d
    where lower(d.domain) = domain_part
      and d.verified = true
    limit 1;

    if matched_org is not null then
      insert into public.organization_members (org_id, user_id, role)
      values (matched_org, new.id, 'member')
      on conflict (org_id, user_id) do nothing;
    end if;
    return new;
  end if;

  -- Individual: personal workspace
  personal_org := 'personal-' || left(replace(new.id::text, '-', ''), 12);

  insert into public.organizations (id, name)
  values (personal_org, display || '''s workspace')
  on conflict (id) do nothing;

  insert into public.organization_members (org_id, user_id, role)
  values (personal_org, new.id, 'owner')
  on conflict (org_id, user_id) do nothing;

  return new;
end;
$$;

-- 029 replaced profile trigger; only create personal org for legacy signups without profile bootstrap
create or replace function public.create_personal_org_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup text;
begin
  signup := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'signup_type'), ''), 'individual'));
  if signup = 'organization' then
    return new;
  end if;
  if coalesce(nullif(trim(new.raw_user_meta_data->>'portal_type'), ''), '') = 'enterprise'
     and signup <> 'individual' then
    return new;
  end if;

  -- Defer to bootstrap_user_org on profiles; avoid duplicate personal org
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
