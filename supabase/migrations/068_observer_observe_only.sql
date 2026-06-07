-- Observer is the free, observe-only plan.
-- It may record Live Feed/audit activity, but it must not verify, approve,
-- block, hold, or gate actions in production.

update public.plans
set
  max_events_per_month = 0,
  max_governed_actions_per_month = 0,
  max_observe_events_per_month = null,
  features = '["connect","live_feed","observe_mode","basic_dashboard","community_support"]'::jsonb
where id = 'observer';
