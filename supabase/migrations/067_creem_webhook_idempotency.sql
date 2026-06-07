-- Durable Creem webhook idempotency + protect profiles.billing_org_id from client edits.

create table if not exists public.creem_webhook_events (
  event_id text primary key,
  event_type text not null,
  org_id text references public.organizations (id) on delete set null,
  processed_at timestamptz not null default now()
);

create index if not exists creem_webhook_events_processed_at_idx
  on public.creem_webhook_events (processed_at desc);

comment on table public.creem_webhook_events is
  'Processed Creem webhook event ids — prevents duplicate plan grants (service role only).';

alter table public.creem_webhook_events enable row level security;

-- No client policies: Edge Functions use service role.

create or replace function public.protect_profiles_billing_org ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.billing_org_id is distinct from old.billing_org_id then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       and coalesce(auth.role(), '') <> 'service_role' then
      new.billing_org_id := old.billing_org_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_billing_org on public.profiles;
create trigger profiles_protect_billing_org
  before update on public.profiles
  for each row
  execute function public.protect_profiles_billing_org();
