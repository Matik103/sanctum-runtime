-- Agent token rotation support.
--
-- token_iat_min: only tokens with iat >= this value are accepted.
-- When an operator rotates a token, this is set to Date.now() so the old
-- token is immediately rejected while the new one (with a later iat) works.
-- NULL means accept any valid HMAC-signed token for this registration.

alter table public.agent_registrations
  add column if not exists token_iat_min bigint;

comment on column public.agent_registrations.token_iat_min is
  'Unix-ms minimum iat for accepted tokens. Set on rotation to invalidate previous tokens immediately.';
