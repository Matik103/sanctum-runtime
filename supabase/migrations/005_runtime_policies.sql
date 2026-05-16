-- Runtime policies (persists across Render redeploys when API syncs to Supabase)

create table if not exists public.runtime_policies (
  action_key text primary key,
  org_id text,
  policy jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_policies_action_key_nonempty check (char_length(action_key) > 0)
);

create index if not exists runtime_policies_org_id_idx
  on public.runtime_policies (org_id);

drop trigger if exists runtime_policies_set_updated_at on public.runtime_policies;
create trigger runtime_policies_set_updated_at
  before update on public.runtime_policies
  for each row
  execute function public.set_updated_at();

alter table public.runtime_policies enable row level security;

-- Authenticated users read global policies and policies for their org
create policy "runtime_policies_select"
  on public.runtime_policies for select
  using (
    org_id is null
    or exists (
      select 1
      from public.organization_members m
      where m.org_id = runtime_policies.org_id
        and m.user_id = auth.uid()
    )
    or org_id = coalesce(auth.jwt() ->> 'org_id', auth.jwt() ->> 'orgId')
  );

-- API (service role) writes; browser clients do not
create policy "runtime_policies_no_client_write"
  on public.runtime_policies for insert
  with check (false);

create policy "runtime_policies_no_client_update"
  on public.runtime_policies for update
  using (false);

create policy "runtime_policies_no_client_delete"
  on public.runtime_policies for delete
  using (false);

comment on table public.runtime_policies is 'Sanctum policy map; action_key may be org-prefixed (acme:unlock_door)';
