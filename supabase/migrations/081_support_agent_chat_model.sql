-- Point support agent at an active OpenRouter Gemini Flash model.
update public.support_agent_config
set value = jsonb_set(value, '{chat_model}', '"google/gemini-2.5-flash"'::jsonb)
where key = 'openrouter'
  and value->>'chat_model' = 'google/gemini-2.0-flash-001';
