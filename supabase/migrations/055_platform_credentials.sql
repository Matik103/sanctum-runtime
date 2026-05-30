-- Encrypted third-party LLM platform API keys per org (Connect Agent).
-- Plaintext secrets never stored; API encrypts with AES-256-GCM (SSO_ENCRYPTION_KEY).

create table if not exists public.platform_credentials (
  id                uuid        primary key default gen_random_uuid(),
  org_id            text        not null,
  platform          text        not null,
  key_suffix        text        not null,
  secret_enc        text        not null,
  default_agent_id  uuid        references public.agent_registrations(id) on delete set null,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_tested_at    timestamptz,
  last_test_ok      boolean,
  last_test_error   text,
  constraint platform_credentials_platform_check
    check (platform in ('openai', 'deepseek', 'qwen', 'kimi', 'doubao', 'gemini')),
  constraint platform_credentials_org_platform_unique unique (org_id, platform)
);

create index if not exists platform_credentials_org_idx
  on public.platform_credentials (org_id);

alter table public.platform_credentials enable row level security;

create policy "org members read platform credentials"
  on public.platform_credentials for select
  using (public.is_org_member(org_id));

create policy "no client write platform credentials"
  on public.platform_credentials for insert
  with check (false);

create policy "no client update platform credentials"
  on public.platform_credentials for update
  using (false);

create policy "no client delete platform credentials"
  on public.platform_credentials for delete
  using (false);

comment on table public.platform_credentials is
  'Org-scoped encrypted LLM provider API keys for Connect Agent proxy (service role writes only).';
