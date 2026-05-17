-- Marketplace expansion: smart-home, ROS2, finance, LangChain, CrewAI, MCP templates.

insert into public.runtime_packages (
  slug,
  name,
  description,
  version,
  publisher,
  category,
  visibility,
  connect_defaults,
  policy_templates,
  readme
)
values
  (
    'smart-home-hub',
    'Smart Home Hub',
    'Home automation runtime — locks, alarms, and device control with verification defaults.',
    '1.0.0',
    'sanctum',
    'smart-home',
    'public',
    '{
      "mode": "hybrid",
      "region": "home-local",
      "metadata": { "package": "smart-home-hub" },
      "suggestedRuntimeName": "home-hub-01",
      "agents": [
        {
          "id": "home_agent",
          "model": "gpt-4o-mini",
          "permissions": ["read", "unlock_door", "disable_alarm"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "unlock_door", "requiresVerification": true },
      { "action": "lock_door", "requiresVerification": false },
      { "action": "disable_alarm", "requiresVerification": true, "blockWhenOffline": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''smart-home-hub'', orgId). 3. Gate unlock_door / disable_alarm with actor home_agent. See examples/marketplace-connect/smart-home.ts'
  ),
  (
    'ros2-mobile',
    'ROS 2 Mobile Robot',
    'AMR / manipulator template for ROS 2 — map tool calls to Sanctum actions before publishing to ROS.',
    '1.0.0',
    'sanctum',
    'robotics',
    'public',
    '{
      "mode": "edge",
      "region": "us-west",
      "metadata": { "package": "ros2-mobile", "stack": "ros2" },
      "suggestedRuntimeName": "ros2-bot-01",
      "agents": [
        {
          "id": "ros2_controller",
          "model": "gpt-4o",
          "permissions": ["movement", "camera_access"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "move_robot", "requiresVerification": false },
      { "action": "robot_arm_move", "requiresVerification": true },
      { "action": "unlock_door", "requiresVerification": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''ros2-mobile'', orgId). 3. verify_action before rclpy publish — actor ros2_controller. See examples/ros2-starter and examples/marketplace-connect/ros2.ts'
  ),
  (
    'finance-agent',
    'Finance & Treasury Agent',
    'Enterprise automation — wire transfers, database access, and privileged account actions.',
    '1.0.0',
    'sanctum',
    'automation',
    'public',
    '{
      "mode": "cloud",
      "region": "us-east",
      "metadata": { "package": "finance-agent" },
      "suggestedRuntimeName": "treasury-01",
      "agents": [
        {
          "id": "treasury_agent",
          "model": "gpt-4o",
          "permissions": ["transfer", "read", "verify"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "transfer_funds", "requiresVerification": true, "blockWhenOffline": true },
      { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true },
      { "action": "create_user", "requiresVerification": true, "blockWhenOffline": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''finance-agent'', orgId). 3. verifyAction with actor treasury_agent. See examples/marketplace-connect/finance.ts'
  ),
  (
    'langchain-agent-host',
    'LangChain Agent Host',
    'LangChain / LangGraph tool-calling runtime — gate each tool with verifyAction before side effects.',
    '1.0.0',
    'sanctum',
    'agent-host',
    'public',
    '{
      "mode": "cloud",
      "region": "us-east",
      "metadata": { "package": "langchain-agent-host", "integration": "langchain" },
      "suggestedRuntimeName": "langchain-host-01",
      "agents": [
        {
          "id": "langchain_agent",
          "model": "gpt-4o-mini",
          "permissions": ["read", "tools", "verify"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "unlock_door", "requiresVerification": true },
      { "action": "send_email", "requiresVerification": true },
      { "action": "delete_file", "requiresVerification": true },
      { "action": "execute_terminal", "autoBlock": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''langchain-agent-host'', orgId). 3. Wrap @tool handlers — actor langchain_agent. Guide: docs/integrations/langchain.md · example: examples/marketplace-connect/langchain.ts'
  ),
  (
    'crewai-crew-host',
    'CrewAI Crew Host',
    'Multi-agent crew runtime — sanctum_gated decorator on CrewAI tools with fleet audit.',
    '1.0.0',
    'sanctum',
    'automation',
    'public',
    '{
      "mode": "cloud",
      "region": "us-east",
      "metadata": { "package": "crewai-crew-host", "integration": "crewai" },
      "suggestedRuntimeName": "crew-host-01",
      "agents": [
        {
          "id": "crew_agent",
          "model": "gpt-4o",
          "permissions": ["read", "tools", "movement"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "robot_arm_move", "requiresVerification": true },
      { "action": "transfer_funds", "requiresVerification": true, "blockWhenOffline": true },
      { "action": "send_email", "requiresVerification": true },
      { "action": "execute_terminal", "autoBlock": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''crewai-crew-host'', orgId). 3. Set SANCTUM_ACTOR=crew_agent. Guide: docs/integrations/crewai.md · example: examples/marketplace-connect/crewai.ts'
  ),
  (
    'mcp-server-host',
    'MCP Server Host',
    'Model Context Protocol server runtime — verify in each tools/call handler before side effects.',
    '1.0.0',
    'sanctum',
    'agent-host',
    'public',
    '{
      "mode": "cloud",
      "region": "us-east",
      "metadata": { "package": "mcp-server-host", "integration": "mcp" },
      "suggestedRuntimeName": "mcp-host-01",
      "agents": [
        {
          "id": "mcp_host",
          "model": "gpt-4o-mini",
          "permissions": ["read", "tools"]
        }
      ]
    }'::jsonb,
    '[
      { "action": "transfer_funds", "requiresVerification": true, "blockWhenOffline": true },
      { "action": "unlock_door", "requiresVerification": true },
      { "action": "execute_terminal", "autoBlock": true },
      { "action": "delete_file", "requiresVerification": true }
    ]'::jsonb,
    '1. Install for your org. 2. connectFromPackage(''mcp-server-host'', orgId). 3. Map each MCP tool → one Sanctum action. Guide: docs/integrations/mcp.md · example: examples/marketplace-connect/mcp.ts'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  connect_defaults = excluded.connect_defaults,
  policy_templates = excluded.policy_templates,
  readme = excluded.readme,
  updated_at = now();
