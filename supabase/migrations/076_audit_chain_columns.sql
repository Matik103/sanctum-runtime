-- Persisted SHA-256 record fingerprints and hash chain links per org audit row.
-- Written at insert time; verified end-to-end via /audit/verify-chain (Team+).

alter table public.audit_events
  add column if not exists record_fingerprint text,
  add column if not exists chain_hash text,
  add column if not exists prev_chain_hash text;

create index if not exists audit_events_org_chain_idx
  on public.audit_events (org_id, created_at asc)
  where org_id is not null;

comment on column public.audit_events.record_fingerprint is 'SHA-256 digest (16 hex) of core audit fields at insert time';
comment on column public.audit_events.chain_hash is 'SHA-256 chain link (16 hex) anchored to prev_chain_hash or genesis';
comment on column public.audit_events.prev_chain_hash is 'chain_hash of prior org audit row by created_at, or null for genesis';
