update public.support_agent_config
set value = jsonb_set(
  jsonb_set(value, '{match_threshold}', '0.65'::jsonb),
  '{sales_intent_min_weight}',
  '4'::jsonb
)
where key = 'retrieval';
