-- Operator API keys (register + rotate) — dashboard Devices page

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id text references public.organizations (id) on delete set null,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  constraint api_keys_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
create index if not exists api_keys_prefix_idx on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

create policy "api_keys_select_own"
  on public.api_keys for select
  using (user_id = auth.uid());

create policy "api_keys_insert_own"
  on public.api_keys for insert
  with check (user_id = auth.uid());

create policy "api_keys_update_own"
  on public.api_keys for update
  using (user_id = auth.uid());

comment on table public.api_keys is 'Per-operator API keys (hash only); full secret shown once on create';
