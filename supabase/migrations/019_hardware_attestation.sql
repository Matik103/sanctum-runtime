-- Hardware attestation challenges (TPM / software-sealed quotes)

create table if not exists public.attestation_challenges (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  org_id text references public.organizations (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists attestation_challenges_expires_idx
  on public.attestation_challenges (expires_at)
  where consumed_at is null;

alter table public.attestation_challenges enable row level security;

create policy "attestation_challenges_select_org_member"
  on public.attestation_challenges for select
  using (
    org_id is null
    or exists (
      select 1 from public.organization_members m
      where m.org_id = attestation_challenges.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.attestation_challenges is 'Single-use nonces for hardware quote verification';
