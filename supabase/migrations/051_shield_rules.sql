-- Sanctum Shield: per-org custom detection and containment rules.
--
-- Operators can define rules that map action patterns to a required
-- response (BLOCK / REQUIRE_VERIFICATION / LOG_ONLY).  These rules are
-- evaluated at /v1/actions/verify before the AI risk model runs, giving
-- operators deterministic control over high-stakes action categories.
--
-- Built-in Shield signals (in the runtime engine) still run regardless of
-- these rules.  A custom rule can only restrict or upgrade a decision, not
-- downgrade a BLOCKED response from the built-in engine.

create table if not exists public.shield_rules (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations (id) on delete cascade,
  -- Pattern matched against the incoming action string.
  -- Supports exact match ('transfer_funds') or wildcard suffix ('transfer_*').
  action_pattern  text    not null,
  -- Human-readable label shown in the dashboard
  label       text        not null,
  -- What the rule mandates when it matches
  response    text        not null check (response in ('BLOCK', 'REQUIRE_VERIFICATION', 'LOG_ONLY')),
  -- Optional category tag for grouping in the UI
  category    text        check (category in ('financial', 'security', 'physical', 'data', 'infrastructure', 'ai', 'other')),
  -- Optional: rule only fires if context.amount exceeds this value (financial rules)
  min_amount  numeric,
  -- Optional: free-form JSONB conditions — evaluated as key/value equality against context
  conditions  jsonb,
  -- Can be toggled without deleting
  enabled     boolean     not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shield_rules_org_id_idx    on public.shield_rules (org_id);
create index if not exists shield_rules_enabled_idx   on public.shield_rules (org_id, enabled);

comment on table  public.shield_rules                 is 'Sanctum Shield: operator-defined action containment rules per organisation';
comment on column public.shield_rules.action_pattern  is 'Exact action name or glob suffix pattern (e.g. transfer_* matches transfer_funds)';
comment on column public.shield_rules.response        is 'BLOCK=deny immediately, REQUIRE_VERIFICATION=hold for human, LOG_ONLY=allow but record';
comment on column public.shield_rules.conditions      is 'Optional context key/value checks e.g. {"targetEnv":"production"}';

alter table public.shield_rules enable row level security;

-- Service role only — the API validates org membership before read/write.
create policy "shield_rules_service_only"
  on public.shield_rules
  for all
  using (false)
  with check (false);

-- ── Shield containment log ────────────────────────────────────────────────────
-- Records every time the Shield engine or a custom rule triggered an
-- automatic containment response (block, pause, revoke).  Separate from the
-- main audit_log so operators can query only containment events.

create table if not exists public.shield_containment_events (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations (id) on delete cascade,
  -- The audit_log row that triggered this containment
  audit_id    uuid,
  actor       text,
  action      text        not null,
  shield_level text       not null check (shield_level in ('elevated', 'high', 'critical')),
  shield_score int,
  -- Signals that fired (array of signal ids from the engine)
  signals     jsonb       not null default '[]',
  -- What the engine decided to do automatically
  automatic_response  jsonb not null default '[]',
  -- Whether the operator has reviewed and resolved this event
  resolved    boolean     not null default false,
  resolved_at timestamptz,
  resolved_by text,
  -- Optional operator notes added during review
  resolution_note text,
  created_at  timestamptz not null default now()
);

create index if not exists shield_containment_org_idx  on public.shield_containment_events (org_id, created_at desc);
create index if not exists shield_containment_unresolved_idx on public.shield_containment_events (org_id, resolved) where resolved = false;

comment on table public.shield_containment_events is 'Log of Sanctum Shield automatic containment actions for operator review';

alter table public.shield_containment_events enable row level security;

create policy "shield_containment_service_only"
  on public.shield_containment_events
  for all
  using (false)
  with check (false);
