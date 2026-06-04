-- bootstrap_user_org declared variable org_id conflicted with organization_members.org_id column.
-- Profile inserts failed silently via handle_new_user; only legacy auth trigger created personal orgs.

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

  if signup = 'organization' then
    org_name := coalesce(
      nullif(trim(meta->>'organization_legal_name'), ''),
      nullif(trim(meta->>'organization_name'), ''),
      'Organization'
    );
    contact_name := coalesce(nullif(trim(meta->>'primary_contact_name'), ''), display);
    v_org_id := public.make_org_id_from_name(org_name);

    insert into public.organizations (
      id,
      name,
      legal_name,
      website,
      country_code,
      company_size,
      industry,
      primary_contact_name,
      primary_contact_email,
      primary_contact_title,
      signup_source
    )
    values (
      v_org_id,
      org_name,
      org_name,
      nullif(trim(meta->>'organization_website'), ''),
      upper(nullif(trim(meta->>'organization_country_code'), '')),
      nullif(trim(meta->>'company_size'), ''),
      nullif(trim(meta->>'industry'), ''),
      contact_name,
      coalesce(nullif(trim(meta->>'primary_contact_email'), ''), user_email),
      nullif(trim(meta->>'primary_contact_title'), ''),
      coalesce(nullif(trim(meta->>'signup_source'), ''), 'dashboard')
    )
    on conflict (id) do update set
      legal_name = coalesce(excluded.legal_name, public.organizations.legal_name),
      website = coalesce(excluded.website, public.organizations.website),
      country_code = coalesce(excluded.country_code, public.organizations.country_code),
      company_size = coalesce(excluded.company_size, public.organizations.company_size),
      industry = coalesce(excluded.industry, public.organizations.industry),
      primary_contact_name = coalesce(excluded.primary_contact_name, public.organizations.primary_contact_name),
      primary_contact_email = coalesce(excluded.primary_contact_email, public.organizations.primary_contact_email),
      primary_contact_title = coalesce(excluded.primary_contact_title, public.organizations.primary_contact_title),
      signup_source = coalesce(excluded.signup_source, public.organizations.signup_source),
      updated_at = now();

    insert into public.organization_members (org_id, user_id, role)
    values (v_org_id, new.id, 'owner')
    on conflict (org_id, user_id) do nothing;

    return new;
  end if;

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

  personal_org := 'personal-' || left(replace(new.id::text, '-', ''), 12);

  insert into public.organizations (id, name, country_code, signup_source)
  values (
    personal_org,
    display || '''s workspace',
    upper(nullif(trim(meta->>'country_code'), '')),
    coalesce(nullif(trim(meta->>'signup_source'), ''), 'dashboard')
  )
  on conflict (id) do nothing;

  insert into public.organization_members (org_id, user_id, role)
  values (personal_org, new.id, 'owner')
  on conflict (org_id, user_id) do nothing;

  return new;
end;
$$;

-- Ensure auth signup runs handle_new_user (profile) not legacy personal-org-only trigger.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill profiles for auth users missing a row (orgs may already exist from legacy trigger).
insert into public.profiles (
  id,
  email,
  display_name,
  portal_type,
  auth_provider,
  job_title,
  country_code,
  accepted_terms_at,
  terms_version
)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'primary_contact_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, 'user'), '@', 1)
  ),
  coalesce(nullif(trim(u.raw_user_meta_data->>'portal_type'), ''), 'operator'),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'auth_provider'), ''),
    nullif(trim(u.raw_app_meta_data->>'provider'), ''),
    'email'
  ),
  nullif(trim(u.raw_user_meta_data->>'primary_contact_title'), ''),
  upper(nullif(trim(coalesce(
    u.raw_user_meta_data->>'country_code',
    u.raw_user_meta_data->>'organization_country_code'
  )), '')),
  (
    case
      when nullif(trim(u.raw_user_meta_data->>'terms_accepted_at'), '') is not null
      then nullif(trim(u.raw_user_meta_data->>'terms_accepted_at'), '')::timestamptz
      else null
    end
  ),
  nullif(trim(u.raw_user_meta_data->>'terms_version'), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
