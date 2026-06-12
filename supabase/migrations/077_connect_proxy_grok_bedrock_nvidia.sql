-- Extend Connect proxy platforms: Grok, NVIDIA NIM, AWS Bedrock

alter table public.platform_credentials
  drop constraint if exists platform_credentials_platform_check;

alter table public.platform_credentials
  add constraint platform_credentials_platform_check
  check (platform in (
    'openai', 'deepseek', 'qwen', 'kimi', 'doubao', 'gemini', 'claude',
    'grok', 'nvidia', 'azure', 'bedrock'
  ));

comment on column public.platform_credentials.proxy_base_url is
  'Optional upstream OpenAI-compatible base URL (required for azure and bedrock).';
