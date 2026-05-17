-- Complete 12 product categories: new primary packages + merge policies into existing templates.

-- ─── Category 1: AI agents (main) + integration profiles ───
update public.runtime_packages set
  category = 'ai-agents',
  description = 'Primary AI agent runtime — tool gating, audit, and org policies. Use langchain-agent-host or mcp-server-host for framework-specific installs.',
  policy_templates = '[
    { "action": "send_email", "requiresVerification": true },
    { "action": "delete_file", "requiresVerification": true },
    { "action": "execute_terminal", "autoBlock": true },
    { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true }
  ]'::jsonb,
  readme = 'Main catalog for category: AI agents. Install → connectFromPackage → verify before each tool. Integrations: langchain-agent-host, mcp-server-host.',
  updated_at = now()
where slug = 'sanctum-agent-host';

update public.runtime_packages set
  category = 'ai-agents',
  readme = 'LangChain integration profile (category: AI agents). Same policies as sanctum-agent-host; see docs/integrations/langchain.md',
  updated_at = now()
where slug = 'langchain-agent-host';

update public.runtime_packages set
  category = 'ai-agents',
  readme = 'MCP server profile (category: AI agents). Map each MCP tool to one Sanctum action; see docs/integrations/mcp.md',
  updated_at = now()
where slug = 'mcp-server-host';

-- ─── Category 4: Smart home (unchanged slug, confirm category) ───
update public.runtime_packages set category = 'smart-home', updated_at = now()
where slug = 'smart-home-hub';

-- ─── Category 5: AI OS (new primary) ───
insert into public.runtime_packages (
  slug, name, description, version, publisher, category, visibility,
  connect_defaults, policy_templates, readme
) values (
  'ai-os-host',
  'AI OS Host',
  'OS-level agent runtime — file, package, process, and shell actions with strict defaults.',
  '1.0.0', 'sanctum', 'ai-os', 'public',
  '{
    "mode": "cloud",
    "region": "us-east",
    "metadata": { "package": "ai-os-host" },
    "suggestedRuntimeName": "ai-os-01",
    "agents": [{ "id": "os_agent", "model": "gpt-4o-mini", "permissions": ["read", "execute"] }]
  }'::jsonb,
  '[
    { "action": "delete_file", "requiresVerification": true },
    { "action": "install_package", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "kill_process", "requiresVerification": true },
    { "action": "execute_terminal", "autoBlock": true }
  ]'::jsonb,
  'Category: AI operating systems. Example: examples/marketplace-connect/ai-os.ts'
) on conflict (slug) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  connect_defaults = excluded.connect_defaults, policy_templates = excluded.policy_templates,
  readme = excluded.readme, updated_at = now();

-- ─── Category 6: Robotics integrators (merge dock/navigate into existing) ───
update public.runtime_packages set
  category = 'robotics',
  policy_templates = '[
    { "action": "move_robot", "requiresVerification": false },
    { "action": "unlock_door", "requiresVerification": true },
    { "action": "disable_alarm", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "navigate", "requiresVerification": false },
    { "action": "dock", "requiresVerification": false },
    { "action": "calibrate_arm", "requiresVerification": true }
  ]'::jsonb,
  readme = 'Category: Robotics integrators (AMR / warehouse). Primary edge deploy template.',
  updated_at = now()
where slug = 'warehouse-robot';

update public.runtime_packages set
  category = 'robotics',
  policy_templates = '[
    { "action": "move_robot", "requiresVerification": false },
    { "action": "robot_arm_move", "requiresVerification": true },
    { "action": "unlock_door", "requiresVerification": true },
    { "action": "navigate", "requiresVerification": false },
    { "action": "dock", "requiresVerification": false }
  ]'::jsonb,
  readme = 'Category: Robotics integrators (ROS 2). See examples/ros2-starter and marketplace-connect/ros2.ts',
  updated_at = now()
where slug = 'ros2-mobile';

-- ─── Category 7: Workflow / automation ───
update public.runtime_packages set
  category = 'automation',
  policy_templates = '[
    { "action": "transfer_funds", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "create_user", "requiresVerification": true, "blockWhenOffline": true }
  ]'::jsonb,
  readme = 'Category: Automation — finance & treasury. For crews see crewai-crew-host.',
  updated_at = now()
where slug = 'finance-agent';

update public.runtime_packages set
  category = 'automation',
  policy_templates = '[
    { "action": "robot_arm_move", "requiresVerification": true },
    { "action": "transfer_funds", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "send_email", "requiresVerification": true },
    { "action": "execute_terminal", "autoBlock": true },
    { "action": "run_workflow", "requiresVerification": true },
    { "action": "post_slack", "requiresVerification": false },
    { "action": "update_crm", "requiresVerification": true }
  ]'::jsonb,
  readme = 'Category: Workflow / automation (CrewAI). Primary multi-agent automation template.',
  updated_at = now()
where slug = 'crewai-crew-host';

-- ─── Category 8: Physical security / edge ───
update public.runtime_packages set
  category = 'edge',
  policy_templates = '[
    { "action": "disable_alarm", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "open_gate", "requiresVerification": true },
    { "action": "arm_perimeter", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "stream_camera", "requiresVerification": false }
  ]'::jsonb,
  readme = 'Category: Physical security / edge. Hybrid IoT gateway template.',
  updated_at = now()
where slug = 'edge-sensor-gateway';

-- ─── Categories 2, 3, 9–12: new primary packages ───
insert into public.runtime_packages (
  slug, name, description, version, publisher, category, visibility,
  connect_defaults, policy_templates, readme
) values
  (
    'humanoid-host',
    'Humanoid Host',
    'Humanoid robot runtime — locomotion, manipulation context, and door interactions.',
    '1.0.0', 'sanctum', 'humanoid', 'public',
    '{
      "mode": "edge",
      "region": "home-v1",
      "metadata": { "package": "humanoid-host" },
      "suggestedRuntimeName": "humanoid-01",
      "agents": [{ "id": "humanoid_agent", "model": "gpt-4o", "permissions": ["movement", "manipulation"] }]
    }'::jsonb,
    '[
      { "action": "move_to_location", "requiresVerification": true },
      { "action": "handover_object", "requiresVerification": true },
      { "action": "unlock_door", "requiresVerification": true }
    ]'::jsonb,
    'Category: Humanoids. Example: examples/marketplace-connect/humanoid.ts'
  ),
  (
    'embodied-ai-host',
    'Embodied AI Host',
    'Arms, carts, drones, kiosks — manipulation and motion with embodied context.',
    '1.0.0', 'sanctum', 'embodied', 'public',
    '{
      "mode": "edge",
      "region": "floor-a",
      "metadata": { "package": "embodied-ai-host" },
      "suggestedRuntimeName": "embodied-01",
      "agents": [{ "id": "embodied_agent", "model": "gpt-4o", "permissions": ["movement", "grasp"] }]
    }'::jsonb,
    '[
      { "action": "move_robot", "requiresVerification": false },
      { "action": "grasp", "requiresVerification": true },
      { "action": "release_payload", "requiresVerification": true },
      { "action": "robot_arm_move", "requiresVerification": true }
    ]'::jsonb,
    'Category: Embodied AI. Complements robotics integrator templates (warehouse-robot, ros2-mobile).'
  ),
  (
    'healthcare-host',
    'Healthcare Robotics Host',
    'Patient-safe robotics and record access with strict verification defaults.',
    '1.0.0', 'sanctum', 'healthcare', 'public',
    '{
      "mode": "hybrid",
      "region": "clinical",
      "metadata": { "package": "healthcare-host" },
      "suggestedRuntimeName": "healthcare-01",
      "agents": [{ "id": "care_agent", "model": "gpt-4o", "permissions": ["read", "dispense"] }]
    }'::jsonb,
    '[
      { "action": "dispense", "requiresVerification": true, "blockWhenOffline": true },
      { "action": "move_bed", "requiresVerification": true },
      { "action": "access_record", "requiresVerification": true, "blockWhenOffline": true }
    ]'::jsonb,
    'Category: Healthcare robotics. Example: examples/marketplace-connect/healthcare.ts'
  ),
  (
    'mobility-host',
    'Autonomous Mobility Host',
    'Fleet navigation and mode changes — routes, occupancy, and door access.',
    '1.0.0', 'sanctum', 'mobility', 'public',
    '{
      "mode": "edge",
      "region": "fleet-west",
      "metadata": { "package": "mobility-host" },
      "suggestedRuntimeName": "mobility-01",
      "agents": [{ "id": "nav_agent", "model": "gpt-4o", "permissions": ["navigation"] }]
    }'::jsonb,
    '[
      { "action": "change_route", "requiresVerification": true },
      { "action": "engage_mode", "requiresVerification": true },
      { "action": "open_door", "requiresVerification": true }
    ]'::jsonb,
    'Category: Autonomous mobility. Example: examples/marketplace-connect/mobility.ts'
  ),
  (
    'companion-host',
    'AI Companion Host',
    'Companion apps — messaging, memory, and commerce boundaries.',
    '1.0.0', 'sanctum', 'companion', 'public',
    '{
      "mode": "cloud",
      "region": "us-east",
      "metadata": { "package": "companion-host" },
      "suggestedRuntimeName": "companion-01",
      "agents": [{ "id": "companion_agent", "model": "gpt-4o-mini", "permissions": ["read", "message"] }]
    }'::jsonb,
    '[
      { "action": "send_message", "requiresVerification": false },
      { "action": "store_memory", "requiresVerification": true },
      { "action": "place_order", "requiresVerification": true, "blockWhenOffline": true }
    ]'::jsonb,
    'Category: AI companions. Example: examples/marketplace-connect/companion.ts'
  ),
  (
    'industrial-host',
    'Industrial Automation Host',
    'Factory lines, emergency stop, and setpoint changes with safety interlocks.',
    '1.0.0', 'sanctum', 'industrial', 'public',
    '{
      "mode": "edge",
      "region": "line-3",
      "metadata": { "package": "industrial-host" },
      "suggestedRuntimeName": "industrial-01",
      "agents": [{ "id": "plc_agent", "model": "gpt-4o-mini", "permissions": ["control"] }]
    }'::jsonb,
    '[
      { "action": "emergency_stop", "requiresVerification": false },
      { "action": "start_line", "requiresVerification": true },
      { "action": "adjust_setpoint", "requiresVerification": true, "blockWhenOffline": true }
    ]'::jsonb,
    'Category: Industrial automation. Example: examples/marketplace-connect/industrial.ts'
  )
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  connect_defaults = excluded.connect_defaults, policy_templates = excluded.policy_templates,
  readme = excluded.readme, updated_at = now();
