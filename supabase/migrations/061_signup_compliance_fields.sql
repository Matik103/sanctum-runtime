-- Standardized signup / tenant intake fields (SOC 2 vendor management, billing, audit).

-- ─── Profiles (account holder) ───
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists country_code char(2),
  add column if not exists accepted_terms_at timestamptz,
  add column if not exists terms_version text;

comment on column public.profiles.job_title is 'Job title at signup (primary contact for org-owned accounts)';
comment on column public.profiles.country_code is 'ISO 3166-1 alpha-2 country at signup';
comment on column public.profiles.accepted_terms_at is 'When user accepted Terms + Privacy at signup';
comment on column public.profiles.terms_version is 'Terms/Privacy document version accepted at signup';

-- ─── Organizations (tenant) ───
alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists website text,
  add column if not exists country_code char(2),
  add column if not exists company_size text,
  add column if not exists industry text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_title text,
  add column if not exists signup_source text;

comment on column public.organizations.legal_name is 'Legal business name collected at self-serve registration';
comment on column public.organizations.website is 'Company website hostname at signup';
comment on column public.organizations.country_code is 'Primary operating country (ISO 3166-1 alpha-2)';
comment on column public.organizations.company_size is 'Employee band at signup';
comment on column public.organizations.industry is 'Industry vertical at signup';
comment on column public.organizations.primary_contact_email is 'Account owner email at org signup';
comment on column public.organizations.primary_contact_title is 'Account owner job title at org signup';
comment on column public.organizations.signup_source is 'Channel that created the org (e.g. dashboard)';

alter table public.organizations drop constraint if exists organizations_company_size_check;
alter table public.organizations
  add constraint organizations_company_size_check check (
    company_size is null
    or company_size in ('1-10', '11-50', '51-200', '201-1000', '1001+')
  );

alter table public.organizations drop constraint if exists organizations_industry_check;
alter table public.organizations
  add constraint organizations_industry_check check (
    industry is null
    or industry in (
      'software', 'robotics', 'manufacturing', 'healthcare', 'financial',
      'defense', 'logistics', 'energy', 'professional', 'other'
    )
  );

-- ─── Profile + org bootstrap from auth metadata ───
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
  job_title text;
  country text;
  terms_at timestamptz;
  terms_ver text;
begin
  signup := lower(coalesce(nullif(trim(new.raw_user_meta_data->>'signup_type'), ''), 'individual'));
  if signup not in ('individual', 'organization') then
    signup := 'individual';
  end if;

  portal := coalesce(nullif(trim(new.raw_user_meta_data->>'portal_type'), ''), 'operator');
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

  job_title := nullif(trim(new.raw_user_meta_data->>'primary_contact_title'), '');
  if job_title is null then
    job_title := nullif(trim(new.raw_user_meta_data->>'job_title'), '');
  end if;

  country := upper(nullif(trim(coalesce(
    new.raw_user_meta_data->>'country_code',
    new.raw_user_meta_data->>'organization_country_code'
  )), ''));

  begin
    terms_at := nullif(trim(new.raw_user_meta_data->>'terms_accepted_at'), '')::timestamptz;
  exception when others then
    terms_at := null;
  end;

  terms_ver := nullif(trim(new.raw_user_meta_data->>'terms_version'), '');

  insert into public.profiles (
    id, email, display_name, portal_type, auth_provider,
    job_title, country_code, accepted_terms_at, terms_version
  )
  values (
    new.id, new.email, contact_name, portal, provider,
    job_title, country, terms_at, terms_ver
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    portal_type = excluded.portal_type,
    auth_provider = excluded.auth_provider,
    job_title = coalesce(excluded.job_title, public.profiles.job_title),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    accepted_terms_at = coalesce(excluded.accepted_terms_at, public.profiles.accepted_terms_at),
    terms_version = coalesce(excluded.terms_version, public.profiles.terms_version),
    updated_at = now();

  return new;
end;
$$;

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
  p.last_sign_in_at,
  p.created_at,
  p.updated_at
from public.profiles p
where p.id = auth.uid();

grant select on public.my_profile to authenticated;

comment on view public.my_profile is 'Current user profile for dashboard header and compliance display';
