-- OpenAI-style API keys: suffix display, hash version, scopes

alter table public.api_keys
  add column if not exists key_suffix text;

alter table public.api_keys
  add column if not exists hash_version text not null default 'sha256_v1';

alter table public.api_keys
  add column if not exists scopes jsonb not null default '["api"]'::jsonb;

comment on column public.api_keys.key_suffix is 'Last 4 chars of secret for dashboard display (OpenAI-style)';
comment on column public.api_keys.hash_version is 'sha256_v1 (legacy) | bcrypt_v1 (peppered bcrypt)';
comment on column public.api_keys.scopes is 'Future: scoped permissions per key';
