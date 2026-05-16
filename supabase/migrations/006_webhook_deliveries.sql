-- Webhook delivery log (ops / debugging; API writes via service role)

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  target_url text not null,
  status_code integer,
  success boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_created_at_idx
  on public.webhook_deliveries (created_at desc);

create index if not exists webhook_deliveries_event_idx
  on public.webhook_deliveries (event, created_at desc);

alter table public.webhook_deliveries enable row level security;

create policy "webhook_deliveries_select_authenticated"
  on public.webhook_deliveries for select
  using (auth.role() = 'authenticated');

create policy "webhook_deliveries_no_client_write"
  on public.webhook_deliveries for insert
  with check (false);

comment on table public.webhook_deliveries is 'Outbound webhook attempts from Sanctum API';
