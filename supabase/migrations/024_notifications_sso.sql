-- Notification preferences and SSO config per org

-- Extend org_plans with notification contact info
alter table public.org_plans
  add column if not exists notification_email text,
  add column if not exists slack_webhook_url text,
  add column if not exists notification_webhook_url text,
  add column if not exists quota_warning_pct integer not null default 80;

-- SSO / OIDC configuration (enterprise feature)
create table if not exists public.sso_configs (
  org_id text primary key references public.organizations (id) on delete cascade,
  oidc_issuer text not null,
  oidc_client_id text not null,
  oidc_client_secret_enc text not null,  -- encrypted at rest (AES-256-GCM via server key)
  oidc_scopes text[] not null default array['openid','email','profile'],
  attribute_map jsonb not null default '{}'::jsonb,  -- maps OIDC claims → Sanctum fields
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sso_configs enable row level security;

-- Only org owners can read/write SSO config
create policy "sso_configs_owner_only"
  on public.sso_configs
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = sso_configs.org_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- Data export audit log: tracks when org data was exported (GDPR compliance)
create table if not exists public.export_audit (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.organizations (id) on delete cascade,
  requested_by text,  -- user email or API key prefix
  export_type text not null default 'full',
  record_count integer,
  created_at timestamptz not null default now()
);

create index if not exists export_audit_org_time_idx
  on public.export_audit (org_id, created_at desc);

alter table public.export_audit enable row level security;

create policy "export_audit_org_member"
  on public.export_audit for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.org_id = export_audit.org_id and m.user_id = auth.uid()
    )
  );

comment on table public.sso_configs  is 'Enterprise OIDC/SAML SSO configuration per org';
comment on table public.export_audit is 'GDPR-required log of all org data exports';
