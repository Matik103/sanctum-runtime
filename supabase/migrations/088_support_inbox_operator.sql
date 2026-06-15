-- Primary support inbox operator (Alex Rivera @ support@sanctumruntime.com).
update public.support_agent_config
set
  value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
    'allowed_emails', jsonb_build_array('support@sanctumruntime.com'),
    'notify_email', 'support@sanctumruntime.com',
    'operators', jsonb_build_array(
      jsonb_build_object(
        'email', 'support@sanctumruntime.com',
        'display_name', 'Alex Rivera',
        'title', 'Sanctum Support'
      )
    )
  ),
  updated_at = now()
where key = 'inbox';
