-- Pin visitor support chat to a fixed free instruct model for consistent tone/quality.
update public.support_agent_config
set value = jsonb_set(value, '{chat_model}', '"meta-llama/llama-3.3-70b-instruct:free"'::jsonb)
where key = 'openrouter';
