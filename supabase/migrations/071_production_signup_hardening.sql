-- Production signup hardening: idempotent workspace bootstrap, enterprise plan rows, OIDC names.

-- Core org bootstrap (callable when profile INSERT trigger was skipped).
create or replace function public.bootstrap_user_org_for_profile(p_user_id uuid)
returns void
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
  portal text;
begin
  if exists (select 1 from public.organization_members m where m.user_id = p_user_id) then
    return;
  end if;

  select p.display_name, p.portal_type, u.email, u.raw_user_meta_data
  into display, portal, user_email, meta
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if user_email is null then
    return;
  end if;

  signup := lower(coalesce(nullif(trim(meta->>'signup_type'), ''), 'individual'));
  if signup not in ('individual', 'organization') then
    signup := 'individual';
  end if;

  display := coalesce(nullif(trim(display), ''), split_part(user_email, '@', 1));
  domain_part := lower(split_part(user_email, '@', 2));
  portal := coalesce(nullif(trim(portal), ''), 'operator');

  if signup = 'organization' then
    org_name := coalesce(
      nullif(trim(meta->>'organization_legal_name'), ''),
      nullif(trim(meta->>'organization_name'), ''),
      'Organization'
    );
    contact_name := coalesce(nullif(trim(meta->>'primary_contact_name'), ''), display);
    v_org_id := public.make_org_id_from_name(org_name);

    insert into public.organizations (
      id, name, legal_name, website, country_code, company_size, industry,
      primary_contact_name, primary_contact_email, primary_contact_title, signup_source
    )
    values (
      v_org_id, org_name, org_name,
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
    values (v_org_id, p_user_id, 'owner')
    on conflict (org_id, user_id) do nothing;

    perform public.ensure_org_plan_row(v_org_id);
    return;
  end if;

  if portal = 'enterprise' then
    select d.org_id into matched_org
    from public.organization_domains d
    where lower(d.domain) = domain_part
      and d.verified = true
    limit 1;

    if matched_org is not null then
      insert into public.organization_members (org_id, user_id, role)
      values (matched_org, p_user_id, 'member')
      on conflict (org_id, user_id) do nothing;
      perform public.ensure_org_plan_row(matched_org);
    end if;
    return;
  end if;

  personal_org := 'personal-' || left(replace(p_user_id::text, '-', ''), 12);

  insert into public.organizations (id, name, country_code, signup_source)
  values (
    personal_org,
    display || '''s workspace',
    upper(nullif(trim(meta->>'country_code'), '')),
    coalesce(nullif(trim(meta->>'signup_source'), ''), 'dashboard')
  )
  on conflict (id) do nothing;

  insert into public.organization_members (org_id, user_id, role)
  values (personal_org, p_user_id, 'owner')
  on conflict (org_id, user_id) do nothing;

  perform public.ensure_org_plan_row(personal_org);
end;
$$;

create or replace function public.bootstrap_user_org ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bootstrap_user_org_for_profile(new.id);
  return new;
end;
$$;

-- Auth signup: map OIDC "name", and bootstrap when profile UPSERT skipped the INSERT trigger.
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
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
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
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    portal_type = excluded.portal_type,
    auth_provider = excluded.auth_provider,
    job_title = coalesce(excluded.job_title, public.profiles.job_title),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    accepted_terms_at = coalesce(excluded.accepted_terms_at, public.profiles.accepted_terms_at),
    terms_version = coalesce(excluded.terms_version, public.profiles.terms_version),
    updated_at = now();

  if not exists (select 1 from public.organization_members m where m.user_id = new.id) then
    perform public.bootstrap_user_org_for_profile(new.id);
  end if;

  return new;
end;
$$;

-- Enterprise SSO: ensure tenant plan row after domain join.
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

  perform public.ensure_org_plan_row(matched_org);

  return matched_org;
end;
$$;

-- Backfill users with profile but no workspace (legacy trigger failures).
do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where not exists (
      select 1 from public.organization_members m where m.user_id = p.id
    )
  loop
    perform public.bootstrap_user_org_for_profile(r.id);
  end loop;
end;
$$;
