-- Destructive: wipes all tenant/user data. Keeps public.plans + public.runtime_packages (catalog).
-- Run via: npm run data:reset -- --confirm RESET_SANCTUM_DATA

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('plans', 'runtime_packages')
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
  END LOOP;
END $$;

-- Re-sync plan tier definitions (idempotent)
INSERT INTO public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) VALUES (
  'observer', 'Observer', NULL,
  3, NULL, 2, 7,
  NULL, 50,
  '["connect","live_feed","observe_mode","basic_dashboard","community_support"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  max_runtimes = EXCLUDED.max_runtimes,
  max_events_per_month = EXCLUDED.max_events_per_month,
  max_agents = EXCLUDED.max_agents,
  retention_days = EXCLUDED.retention_days,
  max_observe_events_per_month = EXCLUDED.max_observe_events_per_month,
  max_governed_actions_per_month = EXCLUDED.max_governed_actions_per_month,
  features = EXCLUDED.features;

INSERT INTO public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) VALUES (
  'personal', 'Personal', 12,
  5, NULL, 5, 30,
  NULL, 500,
  '["connect","live_feed","observe_mode","light_gates","weekly_digest","basic_dashboard","email_alerts"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  max_runtimes = EXCLUDED.max_runtimes,
  max_events_per_month = EXCLUDED.max_events_per_month,
  max_agents = EXCLUDED.max_agents,
  retention_days = EXCLUDED.retention_days,
  max_observe_events_per_month = EXCLUDED.max_observe_events_per_month,
  max_governed_actions_per_month = EXCLUDED.max_governed_actions_per_month,
  features = EXCLUDED.features;

INSERT INTO public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) VALUES (
  'operator', 'Operator', 59,
  25, NULL, 10, 30,
  NULL, 500000,
  '["connect","live_feed","shield_rules","webhooks","live_telemetry","runtime_health","api_access","alerts","cloud_sync","holds_approve"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  max_runtimes = EXCLUDED.max_runtimes,
  max_events_per_month = EXCLUDED.max_events_per_month,
  max_agents = EXCLUDED.max_agents,
  retention_days = EXCLUDED.retention_days,
  max_observe_events_per_month = EXCLUDED.max_observe_events_per_month,
  max_governed_actions_per_month = EXCLUDED.max_governed_actions_per_month,
  features = EXCLUDED.features;

INSERT INTO public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) VALUES (
  'team', 'Team', 299,
  250, NULL, 50, 30,
  NULL, 10000000,
  '["connect","live_feed","shield_rules","sso","rbac","alerts","audit_logs","advanced_fleet","webhooks","compliance_export"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  max_runtimes = EXCLUDED.max_runtimes,
  max_events_per_month = EXCLUDED.max_events_per_month,
  max_agents = EXCLUDED.max_agents,
  retention_days = EXCLUDED.retention_days,
  max_observe_events_per_month = EXCLUDED.max_observe_events_per_month,
  max_governed_actions_per_month = EXCLUDED.max_governed_actions_per_month,
  features = EXCLUDED.features;

INSERT INTO public.plans (
  id, name, price_monthly_usd,
  max_runtimes, max_events_per_month, max_agents, retention_days,
  max_observe_events_per_month, max_governed_actions_per_month, features
) VALUES (
  'enterprise', 'Enterprise', NULL,
  NULL, NULL, NULL, 90,
  NULL, NULL,
  '["everything","air_gap","private_cloud","sla","dedicated_support","compliance","encrypted_memory"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly_usd = EXCLUDED.price_monthly_usd,
  max_runtimes = EXCLUDED.max_runtimes,
  max_events_per_month = EXCLUDED.max_events_per_month,
  max_agents = EXCLUDED.max_agents,
  retention_days = EXCLUDED.retention_days,
  max_observe_events_per_month = EXCLUDED.max_observe_events_per_month,
  max_governed_actions_per_month = EXCLUDED.max_governed_actions_per_month,
  features = EXCLUDED.features;

-- Legacy FK row only (not assigned to new orgs; trigger uses observer)
UPDATE public.plans SET
  name = 'Developer (legacy)',
  max_runtimes = 3,
  max_agents = 5,
  max_events_per_month = NULL,
  max_governed_actions_per_month = 50,
  max_observe_events_per_month = NULL,
  retention_days = 7,
  features = '["basic_dashboard","community_support"]'::jsonb
WHERE id = 'free';

COMMIT;
