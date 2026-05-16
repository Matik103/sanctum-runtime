-- Phase 3: runtime attestation and trust scoring

alter table public.registered_runtimes
  add column if not exists attestation_status text not null default 'unverified'
    check (attestation_status in ('verified', 'unverified', 'limited'));

alter table public.registered_runtimes
  add column if not exists attestation_report jsonb not null default '{}'::jsonb;

alter table public.registered_runtimes
  add column if not exists attestation_token text;

alter table public.registered_runtimes
  add column if not exists attested_at timestamptz;

comment on column public.registered_runtimes.attestation_status is 'verified | unverified | limited (e.g. airgap)';
comment on column public.registered_runtimes.attestation_token is 'HMAC badge for Sanctum Verified Runtime';
comment on column public.registered_runtimes.trust_score is '0-100 computed at connect/attest';
