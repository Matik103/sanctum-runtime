-- Full marketplace catalog reseed (idempotent). Restores packages from 017/021/022/049/050/078.

-- 021 expansion
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

-- 017 edge-sensor-gateway
insert into public.runtime_packages (
  slug, name, description, version, publisher, category, visibility,
  connect_defaults, policy_templates, readme
) values (
      'edge-sensor-gateway',
      'Edge Sensor Gateway',
      'Hybrid IoT gateway — telemetry agent, alarm and offline-sensitive policies.',
      '1.0.0',
      'sanctum',
      'edge',
      'public',
      '{"mode":"hybrid","region":"edge-local","metadata":{"package":"edge-sensor-gateway"},"suggestedRuntimeName":"sensor-gw-01","agents":[{"id":"telemetry","model":"gpt-4o-mini","permissions":["read"]}]}'::jsonb,
      '[{"action":"disable_alarm","requiresVerification":true,"blockWhenOffline":true},{"action":"access_database","requiresVerification":true,"blockWhenOffline":true}]'::jsonb,
      '1. Install for your org. 2. connectFromPackage(''edge-sensor-gateway'', orgId). 3. emitEvent from agent telemetry.'
    )
on conflict (slug) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  connect_defaults = excluded.connect_defaults, policy_templates = excluded.policy_templates,
  readme = excluded.readme, updated_at = now();

-- 022 category primaries + ai-os
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

-- 022 warehouse-robot policy refresh
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

-- 049 domain policy packs
insert into public.runtime_packages
  (slug, name, description, version, publisher, category, visibility, policy_templates, readme)
values
  (
    'healthcare-phi-safety',
    'Healthcare PHI Safety Policy',
    'HIPAA-aligned policies for agents handling Protected Health Information. Blocks unapproved data exports, requires human verification for any PHI transmission, and enforces strict access controls.',
    '1.0.0',
    'Sanctum',
    'healthcare',
    'public',
    '[
      {"action":"export_patient_data","autoBlock":true,"riskPrompt":"This action exports Protected Health Information. HIPAA requires minimum necessary access. Block unless explicitly authorized by a covered entity."},
      {"action":"send_medical_record","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Transmitting medical records requires operator approval and an active secure connection."},
      {"action":"access_phi","requiresVerification":true,"riskPrompt":"PHI access must be logged and approved. Verify the requestor has a legitimate treatment, payment, or operations purpose."},
      {"action":"delete_patient_record","autoBlock":true,"riskPrompt":"Permanent deletion of patient records may violate retention requirements. Always block."},
      {"action":"share_health_data","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Sharing health data with third parties requires explicit patient consent and operator approval."}
    ]'::jsonb,
    '# Healthcare PHI Safety Policy\n\nInstall this pack to enforce HIPAA-aligned controls on any agent handling Protected Health Information.\n\n## What it does\n- Blocks unapproved PHI exports\n- Requires human verification for medical record transmission\n- Forces offline-block for sensitive health data sharing\n\n## Mapped controls\n- HIPAA § 164.312(a)(1) — Access controls\n- HIPAA § 164.312(b) — Audit controls\n- HIPAA § 164.312(e)(2)(ii) — Encryption'
  ),
  (
    'finance-transfer-safety',
    'Finance & Transfer Safety Policy',
    'Controls for agents executing financial operations. Blocks high-value transfers, requires dual verification for wire transfers, and enforces rate limits on payment actions.',
    '1.0.0',
    'Sanctum',
    'finance',
    'public',
    '[
      {"action":"transfer_funds","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Monetary transfers require human approval. Check amount, recipient, and whether the instruction originated from a trusted source."},
      {"action":"wire_transfer","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Wire transfers are irreversible. Always require operator confirmation regardless of amount."},
      {"action":"pay_invoice","requiresVerification":true,"riskPrompt":"Invoice payments require verification to prevent invoice fraud. Confirm vendor identity and amount."},
      {"action":"update_payment_method","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Payment method changes are a common fraud vector. Require explicit operator approval."},
      {"action":"create_refund","requiresVerification":true,"riskPrompt":"Refunds above thresholds or to new recipients require verification to prevent social engineering."},
      {"action":"execute_trade","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Financial trades are high-stakes and time-sensitive. Require confirmation and block when connectivity cannot be verified."}
    ]'::jsonb,
    '# Finance & Transfer Safety Policy\n\nEnforce conservative controls on any agent with access to payment systems or financial APIs.\n\n## What it does\n- Requires human approval for all transfers and wire transactions\n- Blocks all financial operations when the runtime is offline\n- Adds extra scrutiny to invoice payments and refunds'
  ),
  (
    'robotics-ros2-safety',
    'Robotics & ROS2 Safety Policy',
    'Physical-world safety controls for ROS2 and robotic agents. Blocks autonomous locomotion commands, requires verification for manipulator operations, and enforces safety stops.',
    '1.0.0',
    'Sanctum',
    'robotics',
    'public',
    '[
      {"action":"move_robot","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Physical locomotion commands affect the real world and may cause injury or property damage. Require human approval and active telemetry connection."},
      {"action":"actuate_manipulator","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Manipulator arm commands can cause physical harm. Operator must confirm workspace is clear."},
      {"action":"unlock_door","requiresVerification":true,"riskPrompt":"Physical access control changes have real-world security implications. Verify the requester and context."},
      {"action":"emergency_stop","autoBlock":false,"requiresVerification":false,"riskPrompt":"Emergency stop commands should always be permitted immediately without delay."},
      {"action":"disable_safety_sensor","autoBlock":true,"riskPrompt":"Disabling safety sensors violates industrial safety standards. Always block."},
      {"action":"override_speed_limit","autoBlock":true,"riskPrompt":"Speed limit overrides in robotic systems are a safety hazard. Always block."},
      {"action":"autonomous_navigation","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Autonomous navigation in uncontrolled environments requires active operator supervision."}
    ]'::jsonb,
    '# Robotics & ROS2 Safety Policy\n\nSafety-first controls for ROS2 nodes, industrial robots, and autonomous systems.\n\n## What it does\n- Requires operator approval for all locomotion and manipulation commands\n- Blocks safety-critical overrides absolutely\n- Enforces offline-block for all physical-world actions\n\n## Compliance\n- ISO 10218 (Robot safety)\n- IEC 62061 (Functional safety)\n- ROS 2 security best practices'
  ),
  (
    'mcp-tools-baseline',
    'MCP Tools Safety Baseline',
    'Security baseline for Model Context Protocol tool servers. Enforces verification for shell execution, file system writes, and network requests sourced from untrusted content.',
    '1.0.0',
    'Sanctum',
    'mcp',
    'public',
    '[
      {"action":"execute_shell","requiresVerification":true,"blockWhenOffline":true,"riskPrompt":"Shell command execution is high-risk, especially when the instruction originated from tool output or web content. Verify intent and source trust before allowing."},
      {"action":"write_file","requiresVerification":false,"riskPrompt":"File writes from MCP tools should be evaluated for path traversal and overwrite risk. Block if instructionSource is untrusted."},
      {"action":"delete_file","requiresVerification":true,"riskPrompt":"File deletion via MCP tool may be irreversible. Require explicit operator confirmation."},
      {"action":"fetch_url","requiresVerification":false,"riskPrompt":"Web fetches can exfiltrate data or trigger SSRF. Flag if destination is external and source is untrusted."},
      {"action":"read_credentials","autoBlock":true,"riskPrompt":"MCP tools should never directly read credentials or secrets. Always block."},
      {"action":"install_package","requiresVerification":true,"riskPrompt":"Package installation from an agent tool call is a supply-chain risk. Require human review."},
      {"action":"send_email","requiresVerification":true,"riskPrompt":"Outbound email from an MCP tool may exfiltrate data or be part of a social engineering chain. Verify recipient and content."}
    ]'::jsonb,
    '# MCP Tools Safety Baseline\n\nInstall this pack when deploying Model Context Protocol tool servers with Claude or other LLM agents.\n\n## What it does\n- Blocks credential reads absolutely\n- Requires approval for shell execution and file deletion\n- Adds risk context for indirect prompt injection (tool_output source trust)'
  ),
  (
    'claude-desktop-safety',
    'Claude Desktop Agent Policy',
    'Recommended policy pack for Claude Desktop computer-use agents. Balances productivity with safety controls for file system, browser, and system-level actions.',
    '1.0.0',
    'Sanctum',
    'ai-agents',
    'public',
    '[
      {"action":"execute_shell","requiresVerification":true,"riskPrompt":"Shell commands via computer-use are high-risk. Verify intent, especially if the instruction chain involved web browsing."},
      {"action":"access_calendar","requiresVerification":false,"riskPrompt":"Calendar reads are generally low-risk but should be flagged if accessed during off-hours or by an unknown actor."},
      {"action":"send_email","requiresVerification":true,"riskPrompt":"Outbound email drafted by a computer-use agent may send sensitive information. Always require human review."},
      {"action":"browse_web","requiresVerification":false,"riskPrompt":"Web browsing is a common indirect prompt injection vector. Flag if destination is unexpected given the task context."},
      {"action":"download_file","requiresVerification":true,"riskPrompt":"File downloads from the web may introduce malware. Verify the source and file type."},
      {"action":"modify_system_settings","autoBlock":true,"riskPrompt":"System configuration changes are outside the scope of productivity agents. Always block."},
      {"action":"access_keychain","autoBlock":true,"riskPrompt":"Keychain access from an agent is a credential theft risk. Always block."},
      {"action":"read_calendar","requiresVerification":false,"riskPrompt":"Low-risk calendar read. Log for audit purposes."},
      {"action":"create_file","requiresVerification":false,"riskPrompt":"File creation in expected directories is acceptable. Flag if path is system-sensitive."}
    ]'::jsonb,
    '# Claude Desktop Agent Policy\n\nOptimized for Claude Desktop and computer-use agents. Enforces safety controls while allowing routine productivity tasks to proceed uninterrupted.\n\n## What it does\n- Requires approval for email sending and shell execution\n- Blocks keychain access and system setting changes absolutely\n- Flags web browsing and downloads for anomaly detection'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  policy_templates = excluded.policy_templates,
  readme = excluded.readme,
  updated_at = now();

-- 050 trust boundary packs
insert into public.runtime_packages
  (slug, name, description, version, publisher, category, visibility, policy_templates, readme)
values
  (
    'source-trust-injection-defense',
    'Source Trust & Prompt Injection Defense',
    'Baseline controls for indirect prompt-injection resistance. Untrusted retrieved content may inform the model, but cannot directly authorize email, shell, credential, or external-data actions.',
    '1.0.0',
    'Sanctum',
    'security',
    'public',
    '[
      {
        "action":"send_email",
        "requiresVerification":true,
        "blockWhenOffline":true,
        "riskPrompt":"Outbound messages influenced by web pages, email, tool output, or memory are indirect prompt-injection risks. Verify recipient, content, and instruction source.",
        "conditions":[
          {"field":"context.instructionSource","op":"eq","value":"webpage","result":"block"},
          {"field":"context.instructionSource","op":"eq","value":"tool_output","result":"verify"},
          {"field":"context.instructionSource","op":"eq","value":"email","result":"verify"}
        ]
      },
      {
        "action":"execute_shell",
        "requiresVerification":true,
        "blockWhenOffline":true,
        "riskPrompt":"Shell execution must not be authorized by untrusted retrieved content. Block web/tool-output sourced execution chains.",
        "conditions":[
          {"field":"context.instructionSource","op":"eq","value":"webpage","result":"block"},
          {"field":"context.instructionSource","op":"eq","value":"tool_output","result":"block"}
        ]
      },
      {
        "action":"read_credentials",
        "autoBlock":true,
        "riskPrompt":"Credential reads from agent actions are never allowed."
      },
      {
        "action":"transmit_sensitive_data",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "blockWhenOffline":true,
        "riskPrompt":"Sensitive data transmission requires explicit destination, data classification, and human approval.",
        "conditions":[
          {"field":"context.dataSensitivity","op":"eq","value":"secret","result":"block"},
          {"field":"context.destinationTrust","op":"eq","value":"external","result":"verify"}
        ]
      }
    ]'::jsonb,
    '# Source Trust & Prompt Injection Defense\n\nUse this pack for agents that ingest webpages, email, tool output, memory, or retrieved documents.\n\n## What it does\n- Blocks shell execution sourced from untrusted content\n- Requires verification for outbound messages and sensitive transmissions\n- Blocks direct credential access'
  ),
  (
    'action-token-enforcement-baseline',
    'Action Token Enforcement Baseline',
    'Policy pack for executors that require short-lived signed action tokens before side effects run and report execution receipts after completion.',
    '1.0.0',
    'Sanctum',
    'security',
    'public',
    '[
      {
        "action":"execute_approved_action",
        "requiresVerification":true,
        "blockWhenOffline":true,
        "riskPrompt":"Executors should only run side effects after validating a Sanctum signed action token scoped to actor, action, runtime, and audit id."
      },
      {
        "action":"bypass_action_token",
        "autoBlock":true,
        "riskPrompt":"Bypassing action-token validation removes the enforcement boundary. Always block."
      },
      {
        "action":"report_execution_receipt",
        "requiresVerification":false,
        "riskPrompt":"Execution receipts are audit evidence. Allow reporting while logging payload integrity."
      },
      {
        "action":"extend_action_token_ttl",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "riskPrompt":"Longer token TTL increases replay risk. Require a second approver for TTL extension."
      }
    ]'::jsonb,
    '# Action Token Enforcement Baseline\n\nUse this pack when an executor validates Sanctum action tokens before running side effects.\n\n## What it does\n- Blocks token-bypass attempts\n- Requires review before extending token lifetime\n- Keeps execution receipts flowing into audit evidence'
  ),
  (
    'soc2-nist-evidence-pack',
    'SOC2 & NIST Evidence Pack',
    'Compliance operations pack for evidence exports, policy history, approval provenance, runtime attestations, and incident timelines.',
    '1.0.0',
    'Sanctum',
    'compliance',
    'public',
    '[
      {
        "action":"export_evidence_package",
        "requiresVerification":true,
        "riskPrompt":"Evidence exports may contain audit trails, approver identity, runtime metadata, and sensitive operational details. Verify scope and requester."
      },
      {
        "action":"export_soc2_report",
        "requiresVerification":true,
        "riskPrompt":"SOC2 exports should be approved by an operator and logged for auditor provenance."
      },
      {
        "action":"export_nist_ai_rmf_mapping",
        "requiresVerification":true,
        "riskPrompt":"NIST AI RMF mapping exports should include policy version and generated timestamp for auditability."
      },
      {
        "action":"delete_audit_log",
        "autoBlock":true,
        "riskPrompt":"Audit log deletion destroys compliance evidence. Always block."
      },
      {
        "action":"restore_policy_snapshot",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "riskPrompt":"Restoring policy snapshots changes the enforcement boundary. Require second approver."
      }
    ]'::jsonb,
    '# SOC2 & NIST Evidence Pack\n\nUse this pack for compliance operations teams generating audit evidence.\n\n## What it does\n- Protects evidence exports\n- Blocks audit deletion\n- Requires dual approval for policy restores'
  ),
  (
    'policy-replay-shadow-mode',
    'Policy Replay & Shadow Mode',
    'Governance pack for safely testing policies against historical audit logs before enforcing them in production.',
    '1.0.0',
    'Sanctum',
    'governance',
    'public',
    '[
      {
        "action":"run_policy_replay",
        "requiresVerification":false,
        "riskPrompt":"Policy replay is read-only simulation. Allow while logging actor, range, and policy version."
      },
      {
        "action":"enable_shadow_mode",
        "requiresVerification":true,
        "riskPrompt":"Shadow mode affects rollout analytics and policy promotion workflows. Verify owner and target runtime."
      },
      {
        "action":"promote_policy_from_shadow",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "autoEscalateAfterMinutes":15,
        "riskPrompt":"Promoting simulated policy to enforcement can block production actions. Require second approver."
      },
      {
        "action":"bulk_policy_import",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "blockWhenOffline":true,
        "riskPrompt":"Bulk imports change many action boundaries. Require connected runtime and second approver."
      }
    ]'::jsonb,
    '# Policy Replay & Shadow Mode\n\nUse this pack for safe policy rollout.\n\n## What it does\n- Allows read-only replay\n- Requires approval before shadow mode or enforcement promotion\n- Escalates policy promotion if pending'
  ),
  (
    'openai-vercel-agent-stack',
    'OpenAI & Vercel AI SDK Agent Stack',
    'Developer template for modern tool-calling agents built with OpenAI Agents, Responses API, Vercel AI SDK, LangChain, or similar frameworks.',
    '1.0.0',
    'Sanctum',
    'developer-tools',
    'public',
    '[
      {
        "action":"openai_agent_tool_call",
        "requiresVerification":false,
        "riskPrompt":"Gate each tool call based on downstream action, source trust, destination, and data sensitivity."
      },
      {
        "action":"vercel_ai_tool_call",
        "requiresVerification":false,
        "riskPrompt":"Use Sanctum as the enforcement boundary around Vercel AI SDK tool execution."
      },
      {
        "action":"call_external_api",
        "requiresVerification":true,
        "riskPrompt":"External API calls can mutate state or leak data. Verify destination and payload sensitivity.",
        "conditions":[
          {"field":"context.destinationTrust","op":"eq","value":"external","result":"verify"},
          {"field":"context.dataSensitivity","op":"eq","value":"secret","result":"block"}
        ]
      },
      {
        "action":"write_production_data",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "blockWhenOffline":true,
        "riskPrompt":"Production writes from agent tools require strong approval and active connectivity."
      }
    ]'::jsonb,
    '# OpenAI & Vercel AI SDK Agent Stack\n\nUse this pack for modern tool-calling app frameworks.\n\n## What it does\n- Gives developers a default safety boundary around tool calls\n- Verifies external mutations\n- Requires dual approval for production writes'
  ),
  (
    'cloud-ops-agent-safety',
    'Cloud & Ops Agent Safety',
    'Runtime controls for infrastructure agents that deploy services, rotate secrets, modify DNS, scale fleets, or change production configuration.',
    '1.0.0',
    'Sanctum',
    'cloud-ops',
    'public',
    '[
      {
        "action":"deploy_service",
        "requiresVerification":true,
        "riskPrompt":"Deployments mutate production. Verify environment, diff, rollback plan, and approver."
      },
      {
        "action":"rotate_secret",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "blockWhenOffline":true,
        "riskPrompt":"Secret rotation can break production or expose credentials. Require second approver."
      },
      {
        "action":"modify_dns",
        "requiresVerification":true,
        "requireSecondApprover":true,
        "riskPrompt":"DNS changes can redirect traffic. Require second approver and change window."
      },
      {
        "action":"scale_runtime_fleet",
        "requiresVerification":true,
        "riskPrompt":"Fleet scaling changes cost and availability. Verify target size and environment."
      },
      {
        "action":"delete_database",
        "autoBlock":true,
        "riskPrompt":"Database deletion is destructive and irreversible. Always block."
      }
    ]'::jsonb,
    '# Cloud & Ops Agent Safety\n\nUse this pack for cloud operations and infrastructure agents.\n\n## What it does\n- Protects deploy, DNS, and secret rotation workflows\n- Blocks destructive database deletion\n- Requires second approver for high-blast-radius operations'
  ),
  (
    'browser-use-desktop-agent',
    'Browser-Use Desktop Agent Policy',
    'Computer-use template for browser automation agents that click, type, download, upload, and submit forms on behalf of users.',
    '1.0.0',
    'Sanctum',
    'ai-agents',
    'public',
    '[
      {
        "action":"browser_click_submit",
        "requiresVerification":true,
        "riskPrompt":"Submitting forms can send data or mutate external systems. Verify destination, form content, and user intent."
      },
      {
        "action":"browser_type_sensitive_data",
        "requiresVerification":true,
        "blockWhenOffline":true,
        "riskPrompt":"Typing sensitive data into a browser requires explicit user confirmation and trusted destination."
      },
      {
        "action":"browser_upload_file",
        "requiresVerification":true,
        "riskPrompt":"File uploads can exfiltrate sensitive data. Verify file, destination, and recipient."
      },
      {
        "action":"browser_download_file",
        "requiresVerification":true,
        "riskPrompt":"Downloads can introduce malware. Verify source and file type."
      },
      {
        "action":"accept_terms_or_cookie_banner",
        "requiresVerification":false,
        "riskPrompt":"Routine consent UI interactions are low risk but should remain auditable."
      }
    ]'::jsonb,
    '# Browser-Use Desktop Agent Policy\n\nUse this pack for computer-use agents that operate browser sessions.\n\n## What it does\n- Requires approval before submitting forms, uploading files, or typing sensitive data\n- Allows low-risk cookie/banner actions\n- Logs browser-side actions for audit trails'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  version = excluded.version,
  publisher = excluded.publisher,
  category = excluded.category,
  visibility = excluded.visibility,
  policy_templates = excluded.policy_templates,
  readme = excluded.readme,
  updated_at = now();

-- 078 core packages (connect-agent-starter, sanctum-agent-host)
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

-- Re-apply extended warehouse-robot policies after 078 upsert
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
