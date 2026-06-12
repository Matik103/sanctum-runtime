-- Ensure public marketplace catalog is present (idempotent re-seed for production).

insert into public.runtime_packages (
  slug, name, description, version, publisher, category, visibility,
  connect_defaults, policy_templates, readme
)
values
  (
    'sanctum-agent-host',
    'Sanctum Agent Host',
    'General-purpose AI agent runtime — connect, register agents, and gate tool use with org policies.',
    '1.0.0',
    'sanctum',
    'ai-agents',
    'public',
    '{"mode":"cloud","region":"us-east","metadata":{"package":"sanctum-agent-host"},"suggestedRuntimeName":"agent-host-01","agents":[{"id":"default_agent","model":"gpt-4o-mini","permissions":["read","verify","send_email"]}]}'::jsonb,
    '[
      {"action":"send_email","requiresVerification":true},
      {"action":"delete_file","requiresVerification":true},
      {"action":"execute_terminal","autoBlock":true},
      {"action":"access_database","requiresVerification":true,"blockWhenOffline":true}
    ]'::jsonb,
    'Install → connectFromPackage(''sanctum-agent-host'', orgId) → verify before each tool.'
  ),
  (
    'connect-agent-starter',
    'Connect Agent Starter',
    'OpenAI-compatible proxy starter — Strict-style policies for transfers, email, shell, and database actions.',
    '1.0.0',
    'sanctum',
    'ai-agents',
    'public',
    '{"mode":"cloud","region":"us-east","metadata":{"package":"connect-agent-starter"},"suggestedRuntimeName":"connect-01","agents":[{"id":"connect_agent","model":"gpt-4o-mini","permissions":["read","verify"]}]}'::jsonb,
    '[
      {"action":"send_email","requiresVerification":true,"reasoning":"Connect starter: outbound email requires approval."},
      {"action":"send_status_email","requiresVerification":true,"reasoning":"Connect starter: status email requires approval."},
      {"action":"delete_file","requiresVerification":true,"reasoning":"Connect starter: deletions require approval."},
      {"action":"delete_database","autoBlock":true,"reasoning":"Connect starter: database delete blocked."},
      {"action":"transfer_funds","autoBlock":true,"reasoning":"Connect starter: fund transfers blocked."},
      {"action":"unlock_door","requiresVerification":true,"reasoning":"Connect starter: physical access requires approval."},
      {"action":"execute_shell","autoBlock":true,"reasoning":"Connect starter: shell execution blocked."}
    ]'::jsonb,
    'Recommended for Connect Agent adopters. Install → Dashboard → Connect → copy proxy URL. Policies apply on install.'
  ),
  (
    'warehouse-robot',
    'Warehouse Robot',
    'Warehouse AMR template — edge mode, navigation agent, movement and door policies.',
    '1.0.0',
    'sanctum',
    'robotics',
    'public',
    '{"mode":"edge","region":"us-west","metadata":{"package":"warehouse-robot"},"suggestedRuntimeName":"warehouse-bot-01","agents":[{"id":"navigation","model":"gpt-4o","permissions":["movement","camera_access"]}]}'::jsonb,
    '[
      {"action":"move_robot","requiresVerification":false},
      {"action":"unlock_door","requiresVerification":true},
      {"action":"disable_alarm","requiresVerification":true,"blockWhenOffline":true}
    ]'::jsonb,
    'Install → connectFromPackage(''warehouse-robot'', orgId).'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  connect_defaults = excluded.connect_defaults,
  policy_templates = excluded.policy_templates,
  readme = excluded.readme,
  updated_at = now();
