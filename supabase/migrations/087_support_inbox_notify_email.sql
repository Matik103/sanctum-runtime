-- Ensure human handoff alerts always target support@ (idempotent).
insert into public.support_agent_config (key, value, description)
values (
  'inbox',
  jsonb_build_object(
    'allowed_emails', '[]'::jsonb,
    'notify_email', 'support@sanctumruntime.com',
    'slack_webhook_url', null
  ),
  'Human inbox operators and handoff notification targets'
)
on conflict (key) do update set
  value = coalesce(public.support_agent_config.value, '{}'::jsonb) ||
    jsonb_build_object('notify_email', 'support@sanctumruntime.com'),
  updated_at = now();
