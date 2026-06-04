-- Enterprise SSO domain verification (DNS TXT proof + audit metadata).

alter table public.organization_domains
  add column if not exists verification_token text,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_method text,
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.organization_domains drop constraint if exists organization_domains_verification_method_check;
alter table public.organization_domains
  add constraint organization_domains_verification_method_check check (
    verification_method is null
    or verification_method in ('dns_txt', 'manual')
  );

comment on column public.organization_domains.verification_token is 'Secret token proved via DNS TXT before verified=true';
comment on column public.organization_domains.verified_at is 'When domain ownership was confirmed';
comment on column public.organization_domains.verification_method is 'How the domain was verified (dns_txt or manual ops)';
comment on column public.organization_domains.created_by is 'Admin who registered the domain';

drop trigger if exists organization_domains_set_updated_at on public.organization_domains;
create trigger organization_domains_set_updated_at
  before update on public.organization_domains
  for each row
  execute function public.set_updated_at();
