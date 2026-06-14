-- Support agent knowledge base (marketing site visitor assistant).
-- Platform-scoped — not org-tenant data. API ingests blog/docs/product content and serves RAG via service_role.
-- Embeddings: vector(1536) — default for OpenRouter / OpenAI-class embedding models (re-embed if model dims change).

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Sources: canonical documents (blog posts, docs sections, marketing pages, sales playbooks)
-- ---------------------------------------------------------------------------
create table if not exists public.support_kb_sources (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  source_type       text not null check (source_type in (
                      'blog',
                      'docs',
                      'marketing_page',
                      'product',
                      'faq',
                      'sales_playbook',
                      'api_reference',
                      'glossary',
                      'changelog',
                      'pricing',
                      'comparison',
                      'integration'
                    )),
  title             text not null,
  summary           text,
  content_markdown  text not null default '',
  canonical_url     text,
  external_key      text,
  tags              text[] not null default '{}',
  intent_tags       text[] not null default '{}',
  sales_weight      smallint not null default 0 check (sales_weight between 0 and 10),
  sales_signals     jsonb not null default '{}'::jsonb,
  is_published      boolean not null default true,
  content_hash      text,
  token_estimate    int,
  last_synced_at    timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_type, external_key)
);

comment on table public.support_kb_sources is
  'Canonical KB documents for the public support/sales agent. Synced from blog registry, docs, and marketing surfaces.';
comment on column public.support_kb_sources.slug is
  'Stable id e.g. blog/how-to-validate-tool-arguments-in-mcp, docs/verify-action, page/pricing';
comment on column public.support_kb_sources.intent_tags is
  'Retrieval hints: learn, troubleshoot, compare, buy, onboard, upsell, security, compliance, robotics, mcp';
comment on column public.support_kb_sources.sales_weight is
  'Higher = more likely surfaced for conversion-oriented visitor questions (0–10).';
comment on column public.support_kb_sources.sales_signals is
  'JSON: recommended_plan, cta_path, compare_against[], feature_hooks[], objection_handlers[]';

create index if not exists support_kb_sources_type_published_idx
  on public.support_kb_sources (source_type, is_published);

create index if not exists support_kb_sources_tags_gin_idx
  on public.support_kb_sources using gin (tags);

create index if not exists support_kb_sources_intent_tags_gin_idx
  on public.support_kb_sources using gin (intent_tags);

create index if not exists support_kb_sources_sales_weight_idx
  on public.support_kb_sources (sales_weight desc)
  where is_published = true;

-- ---------------------------------------------------------------------------
-- Chunks: RAG retrieval units with embeddings
-- ---------------------------------------------------------------------------
create table if not exists public.support_kb_chunks (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid not null references public.support_kb_sources (id) on delete cascade,
  chunk_index       int not null check (chunk_index >= 0),
  chunk_kind        text not null default 'paragraph' check (chunk_kind in (
                      'paragraph',
                      'heading',
                      'faq',
                      'checklist',
                      'cta',
                      'pricing',
                      'comparison',
                      'code'
                    )),
  heading           text,
  content           text not null,
  content_hash      text not null,
  token_estimate    int,
  embedding         vector(1536),
  embedding_model   text,
  embedded_at       timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_id, chunk_index)
);

comment on table public.support_kb_chunks is
  'Chunked text + embeddings for semantic search. embedding null until ingest job runs.';

create index if not exists support_kb_chunks_source_idx
  on public.support_kb_chunks (source_id, chunk_index);

create index if not exists support_kb_chunks_pending_embed_idx
  on public.support_kb_chunks (created_at)
  where embedding is null;

create index if not exists support_kb_chunks_embedding_hnsw_idx
  on public.support_kb_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

-- ---------------------------------------------------------------------------
-- Sync runs: audit blog/docs ingest and re-embed jobs
-- ---------------------------------------------------------------------------
create table if not exists public.support_kb_sync_runs (
  id                uuid primary key default gen_random_uuid(),
  trigger           text not null default 'manual' check (trigger in (
                      'manual',
                      'scheduled',
                      'blog_publish',
                      'docs_publish',
                      'full_reindex'
                    )),
  status            text not null default 'running' check (status in (
                      'running',
                      'completed',
                      'failed',
                      'partial'
                    )),
  sources_upserted  int not null default 0,
  sources_unchanged int not null default 0,
  chunks_created    int not null default 0,
  chunks_updated    int not null default 0,
  chunks_deleted    int not null default 0,
  embeddings_written int not null default 0,
  error_message     text,
  details           jsonb not null default '{}'::jsonb,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);

comment on table public.support_kb_sync_runs is
  'Observability for KB ingest — run after each new blog article or docs change.';

-- ---------------------------------------------------------------------------
-- Agent runtime config (models, persona, retrieval defaults)
-- ---------------------------------------------------------------------------
create table if not exists public.support_agent_config (
  key               text primary key,
  value             jsonb not null,
  description       text,
  updated_at        timestamptz not null default now()
);

comment on table public.support_agent_config is
  'Key-value config for the marketing support agent (OpenRouter models, prompts, retrieval knobs).';

-- ---------------------------------------------------------------------------
-- Visitor chat sessions (anonymous marketing-site conversations)
-- ---------------------------------------------------------------------------
create table if not exists public.support_agent_sessions (
  id                uuid primary key default gen_random_uuid(),
  public_id         text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
  visitor_fingerprint text,
  referrer          text,
  landing_path      text,
  locale            text not null default 'en',
  metadata          jsonb not null default '{}'::jsonb,
  last_message_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists support_agent_sessions_last_message_idx
  on public.support_agent_sessions (last_message_at desc nulls last);

create table if not exists public.support_agent_messages (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.support_agent_sessions (id) on delete cascade,
  role              text not null check (role in ('user', 'assistant', 'system')),
  content           text not null,
  citation_chunk_ids uuid[] not null default '{}',
  citation_sources  jsonb not null default '[]'::jsonb,
  model             text,
  token_usage       jsonb not null default '{}'::jsonb,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists support_agent_messages_session_created_idx
  on public.support_agent_messages (session_id, created_at);

comment on column public.support_agent_messages.citation_sources is
  'Snapshot for UI: [{ slug, title, url, chunk_id }]';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists support_kb_sources_set_updated_at on public.support_kb_sources;
create trigger support_kb_sources_set_updated_at
  before update on public.support_kb_sources
  for each row execute function public.set_updated_at();

drop trigger if exists support_kb_chunks_set_updated_at on public.support_kb_chunks;
create trigger support_kb_chunks_set_updated_at
  before update on public.support_kb_chunks
  for each row execute function public.set_updated_at();

drop trigger if exists support_agent_sessions_set_updated_at on public.support_agent_sessions;
create trigger support_agent_sessions_set_updated_at
  before update on public.support_agent_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists support_agent_config_set_updated_at on public.support_agent_config;
create trigger support_agent_config_set_updated_at
  before update on public.support_agent_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Semantic search RPC (cosine similarity; service_role / API only)
-- ---------------------------------------------------------------------------
create or replace function public.match_support_kb_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  match_threshold float default 0.72,
  filter_source_types text[] default null,
  filter_intent_tags text[] default null,
  min_sales_weight int default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_slug text,
  source_type text,
  source_title text,
  canonical_url text,
  chunk_kind text,
  heading text,
  content text,
  similarity float,
  intent_tags text[],
  sales_weight smallint,
  sales_signals jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as chunk_id,
    s.id as source_id,
    s.slug as source_slug,
    s.source_type,
    s.title as source_title,
    s.canonical_url,
    c.chunk_kind,
    c.heading,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    s.intent_tags,
    s.sales_weight,
    s.sales_signals
  from public.support_kb_chunks c
  join public.support_kb_sources s on s.id = c.source_id
  where s.is_published = true
    and c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
    and (filter_source_types is null or s.source_type = any (filter_source_types))
    and (filter_intent_tags is null or s.intent_tags && filter_intent_tags)
    and (min_sales_weight is null or s.sales_weight >= min_sales_weight)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_support_kb_chunks(vector, int, float, text[], text[], int) from public;
grant execute on function public.match_support_kb_chunks(vector, int, float, text[], text[], int) to service_role;

comment on function public.match_support_kb_chunks is
  'RAG retrieval for support agent — cosine similarity over published KB chunks.';

-- ---------------------------------------------------------------------------
-- RLS: API service_role only (marketing agent backend); no direct anon access
-- ---------------------------------------------------------------------------
alter table public.support_kb_sources enable row level security;
alter table public.support_kb_chunks enable row level security;
alter table public.support_kb_sync_runs enable row level security;
alter table public.support_agent_config enable row level security;
alter table public.support_agent_sessions enable row level security;
alter table public.support_agent_messages enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'support_kb_sources' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_kb_sources
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_kb_chunks' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_kb_chunks
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_kb_sync_runs' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_kb_sync_runs
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_agent_config' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_agent_config
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_agent_sessions' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_agent_sessions
      for all to service_role using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'support_agent_messages' and policyname = 'Service role full access'
  ) then
    create policy "Service role full access" on public.support_agent_messages
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Default agent config (override via dashboard or env; OpenRouter free-tier friendly)
-- ---------------------------------------------------------------------------
insert into public.support_agent_config (key, value, description)
values
  (
    'openrouter',
    jsonb_build_object(
      'chat_model', 'google/gemini-2.0-flash-001',
      'embedding_model', 'openai/text-embedding-3-small',
      'embedding_dimensions', 1536,
      'temperature', 0.35,
      'max_context_chunks', 8,
      'sales_chunk_boost', 0.05
    ),
    'OpenRouter model IDs — prefer free routes when available; keep embedding_dimensions aligned with vector column.'
  ),
  (
    'persona',
    jsonb_build_object(
      'name', 'Sanctum Guide',
      'tone', 'helpful, precise, confident — runtime trust expert, not a generic chatbot',
      'goals', jsonb_build_array(
        'Answer product and security questions using KB citations only',
        'Teach visitors with links to blog articles and docs',
        'Recommend Sanctum Runtime when execution-time control fits the problem',
        'Upsell console, pilot, or enterprise when intent is buy or scale'
      ),
      'never', jsonb_build_array(
        'Invent features or pricing not in KB',
        'Claim guardrails replace runtime authorization',
        'Share customer org data'
      )
    ),
    'System persona for visitor-facing support + sales agent.'
  ),
  (
    'retrieval',
    jsonb_build_object(
      'match_count', 8,
      'match_threshold', 0.72,
      'sales_intent_min_weight', 6,
      'educational_source_types', jsonb_build_array('blog', 'docs', 'faq', 'glossary'),
      'conversion_source_types', jsonb_build_array('pricing', 'product', 'sales_playbook', 'comparison')
    ),
    'RAG defaults passed to match_support_kb_chunks.'
  )
on conflict (key) do nothing;
