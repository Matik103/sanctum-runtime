-- Switch RAG embeddings to OpenRouter's only free embedding model (Nemotron VL 1B).
-- Native output is 2048 dims; API slices to embedding_dimensions (1536) before vector search.
update public.support_agent_config
set value = jsonb_set(
  jsonb_set(
    value,
    '{embedding_model}',
    '"nvidia/llama-nemotron-embed-vl-1b-v2:free"'::jsonb
  ),
  '{embedding_dimensions}',
  '1536'::jsonb
)
where key = 'openrouter';
