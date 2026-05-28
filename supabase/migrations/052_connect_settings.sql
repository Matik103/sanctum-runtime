-- Per-user connect preferences: agent token + platform API key stored encrypted.
-- Raw values are AES-256-GCM encrypted at the application layer before insertion;
-- the database never holds plaintext secrets.
create table if not exists public.connect_settings (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  org_id               text        not null,
  platform             text        not null,
  agent_token_enc      text,
  platform_api_key_enc text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique(user_id, org_id, platform)
);

alter table public.connect_settings enable row level security;

create policy "users manage their own connect settings"
  on public.connect_settings
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
