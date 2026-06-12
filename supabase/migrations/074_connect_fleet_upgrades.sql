-- Connect + fleet UX upgrades: Claude/Azure platforms, per-agent pause, Azure base URL

alter table public.platform_credentials
  drop constraint if exists platform_credentials_platform_check;

alter table public.platform_credentials
  add constraint platform_credentials_platform_check
  check (platform in ('openai', 'deepseek', 'qwen', 'kimi', 'doubao', 'gemini', 'claude', 'azure'));

alter table public.platform_credentials
  add column if not exists proxy_base_url text;

comment on column public.platform_credentials.proxy_base_url is
  'Optional upstream OpenAI-compatible base URL (required for azure; e.g. https://my-resource.openai.azure.com/openai/deployments/my-dep)';

alter table public.agent_registrations
  add column if not exists actions_paused boolean not null default false;

alter table public.agent_registrations
  add column if not exists actions_paused_at timestamptz;

alter table public.agent_registrations
  add column if not exists actions_paused_by text;

comment on column public.agent_registrations.actions_paused is
  'When true, verify and Connect proxy reject actions for this agent until resumed.';
