-- Use OpenRouter's free model router (zero cost, auto-selects available free instruct models).
update public.support_agent_config
set value = jsonb_set(value, '{chat_model}', '"openrouter/free"'::jsonb)
where key = 'openrouter';
