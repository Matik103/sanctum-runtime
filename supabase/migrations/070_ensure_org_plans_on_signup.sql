-- Every workspace must get org_plans (Developer / observer) on signup.
-- Upserts and ON CONFLICT DO UPDATE skip trg_assign_free_plan, so bootstrap must insert explicitly.

create or replace function public.ensure_org_plan_row(p_org_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_plans (org_id, plan_id)
  values (p_org_id, 'observer')
  on conflict (org_id) do nothing;
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

    perform public.ensure_org_plan_row(v_org_id);
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
      perform public.ensure_org_plan_row(matched_org);
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

  perform public.ensure_org_plan_row(personal_org);
  return new;
end;
$$;

-- Backfill workspaces missing a plan row (legacy signups, upsert-only org creation).
insert into public.org_plans (org_id, plan_id)
select o.id, 'observer'
from public.organizations o
where not exists (
  select 1 from public.org_plans op where op.org_id = o.id
);

-- Normalize legacy free tier ids to observer (UI label: Developer).
update public.org_plans
set plan_id = 'observer', updated_at = now()
where plan_id = 'free';
