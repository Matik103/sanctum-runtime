-- Auth portal: operator vs enterprise, SSO metadata, org bootstrap

-- ——— Profiles: portal + auth metadata ———

alter table public.profiles
  add column if not exists portal_type text not null default 'operator'
    check (portal_type in ('operator', 'enterprise'));

alter table public.profiles
  add column if not exists auth_provider text;

alter table public.profiles
  add column if not exists last_sign_in_at timestamptz;

comment on column public.profiles.portal_type is 'operator = email/password; enterprise = org SSO';
comment on column public.profiles.auth_provider is 'email | google | azure | github';

-- ——— Enterprise domain → org mapping (SSO auto-join) ———

create table if not exists public.organization_domains (
  domain text primary key,
  org_id text not null references public.organizations (id) on delete cascade,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists organization_domains_org_id_idx
  on public.organization_domains (org_id);

alter table public.organization_domains enable row level security;

create policy "org_domains_select_member"
  on public.organization_domains for select
  using (
    exists (
      select 1
      from public.organization_members m
      where m.org_id = organization_domains.org_id
        and m.user_id = auth.uid()
    )
  );

create policy "org_domains_service_write"
  on public.organization_domains for all
  using (false)
  with check (false);

comment on table public.organization_domains is 'Maps email domains to orgs for enterprise SSO join';

-- ——— Signup: profile from auth.users ———

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  portal text;
  provider text;
begin
  portal := coalesce(
    nullif(trim(new.raw_user_meta_data->>'portal_type'), ''),
    'operator'
  );
  if portal not in ('operator', 'enterprise') then
    portal := 'operator';
  end if;

  provider := coalesce(
    nullif(trim(new.raw_user_meta_data->>'auth_provider'), ''),
    nullif(trim(new.raw_app_meta_data->>'provider'), ''),
    case when new.email is not null then 'email' else null end
  );

  insert into public.profiles (id, email, display_name, portal_type, auth_provider)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    portal,
    provider
  );

  return new;
end;
$$;

-- ——— Keep profile in sync on auth user updates ———

create or replace function public.handle_auth_user_updated ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider text;
begin
  provider := coalesce(
    nullif(trim(new.raw_user_meta_data->>'auth_provider'), ''),
    nullif(trim(new.raw_app_meta_data->>'provider'), ''),
    (select p.auth_provider from public.profiles p where p.id = new.id)
  );

  update public.profiles
  set
    email = new.email,
    display_name = coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      display_name
    ),
    auth_provider = provider,
    last_sign_in_at = new.last_sign_in_at,
    updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;

create trigger on_auth_user_updated
  after update on auth.users
  for each row
  execute function public.handle_auth_user_updated();

-- ——— Bootstrap org membership after profile insert ———

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
begin
  select u.email into user_email
  from auth.users u
  where u.id = new.id;

  if user_email is null then
    return new;
  end if;

  domain_part := lower(split_part(user_email, '@', 2));
  display := coalesce(nullif(trim(new.display_name), ''), split_part(user_email, '@', 1));

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
  else
    personal_org := 'personal-' || left(replace(new.id::text, '-', ''), 12);

    insert into public.organizations (id, name)
    values (personal_org, display || '''s workspace')
    on conflict (id) do nothing;

    insert into public.organization_members (org_id, user_id, role)
    values (personal_org, new.id, 'owner')
    on conflict (org_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_created_bootstrap on public.profiles;

create trigger on_profile_created_bootstrap
  after insert on public.profiles
  for each row
  execute function public.bootstrap_user_org();

-- ——— Dashboard helpers ———

create or replace function public.get_my_orgs ()
returns table (org_id text, org_name text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, m.role
  from public.organization_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name;
$$;

grant execute on function public.get_my_orgs () to authenticated;

create or replace view public.my_profile as
select
  p.id,
  p.email,
  p.display_name,
  p.portal_type,
  p.auth_provider,
  p.last_sign_in_at,
  p.created_at,
  p.updated_at
from public.profiles p
where p.id = auth.uid();

grant select on public.my_profile to authenticated;

comment on view public.my_profile is 'Current user profile for dashboard header';
