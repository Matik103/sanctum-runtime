-- Deferred entitlements on paid downgrades: Creem billing may change immediately,
-- but Sanctum keeps the higher tier until pending_plan_effective_at.

alter table public.org_plans
  add column if not exists pending_plan_id text,
  add column if not exists pending_plan_effective_at timestamptz;

comment on column public.org_plans.pending_plan_id is
  'Lower tier to apply at period end after a paid downgrade (entitlements only).';
comment on column public.org_plans.pending_plan_effective_at is
  'When pending_plan_id replaces plan_id for entitlements.';
