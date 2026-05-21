-- Missing indexes on high-frequency lookup columns.
-- These were absent from earlier migrations but are needed for query performance.

-- api_keys: fetched by user_id on every dashboard load
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON public.api_keys (user_id);

-- organization_members: used in almost every RLS policy
CREATE INDEX IF NOT EXISTS idx_org_members_user_org
  ON public.organization_members (user_id, org_id);

-- org_plans: fetched by org_id on billing page and quota checks
CREATE INDEX IF NOT EXISTS idx_org_plans_org_id
  ON public.org_plans (org_id);
