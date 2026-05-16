-- Organizations and membership (multi-tenant operators)

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id text not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "organizations_select_member"
  on public.organizations for select
  using (
    exists (
      select 1
      from public.organization_members m
      where m.org_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

create policy "org_members_select_own_orgs"
  on public.organization_members for select
  using (user_id = auth.uid());

create policy "org_members_select_same_org"
  on public.organization_members for select
  using (
    exists (
      select 1
      from public.organization_members m
      where m.org_id = organization_members.org_id
        and m.user_id = auth.uid()
    )
  );

-- Inserts/updates via service role or future admin UI (API uses service role for org bootstrap)
create policy "organizations_service_write"
  on public.organizations for all
  using (false)
  with check (false);

create policy "org_members_service_write"
  on public.organization_members for all
  using (false)
  with check (false);

comment on table public.organizations is 'Tenant / org slug (matches context.org_id in actions)';
comment on table public.organization_members is 'Maps Supabase auth users to organizations';
