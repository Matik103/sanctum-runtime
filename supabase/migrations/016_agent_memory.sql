-- Phase 3+: encrypted agent memory vault (ciphertext only — keys stay on client)

create table if not exists public.agent_memory_entries (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  runtime_id uuid not null references public.registered_runtimes (id) on delete cascade,
  agent_id text not null,
  memory_key text not null,
  ciphertext text not null,
  iv text not null,
  algorithm text not null default 'aes-256-gcm',
  key_hint text,
  metadata jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (runtime_id, agent_id, memory_key)
);

create index if not exists agent_memory_org_idx
  on public.agent_memory_entries (org_id);

create index if not exists agent_memory_runtime_agent_idx
  on public.agent_memory_entries (runtime_id, agent_id);

drop trigger if exists agent_memory_entries_set_updated_at on public.agent_memory_entries;
create trigger agent_memory_entries_set_updated_at
  before update on public.agent_memory_entries
  for each row
  execute function public.set_updated_at();

alter table public.agent_memory_entries enable row level security;

create policy "agent_memory_select_org_member"
  on public.agent_memory_entries for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = agent_memory_entries.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.agent_memory_entries is 'Encrypted agent memory blobs; decryption keys never stored server-side';
