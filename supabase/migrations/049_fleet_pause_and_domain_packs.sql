-- Fleet pause: lets operators halt all agent action approvals org-wide.
-- When fleet_paused = true, every /v1/actions/verify returns BLOCKED.

alter table public.organizations
  add column if not exists fleet_paused       boolean     not null default false,
  add column if not exists fleet_paused_at    timestamptz,
  add column if not exists fleet_paused_by    text;

comment on column public.organizations.fleet_paused    is 'Kill switch: when true all verify calls for this org are blocked';
comment on column public.organizations.fleet_paused_at is 'When the fleet was paused';
comment on column public.organizations.fleet_paused_by is 'User id or identifier who paused the fleet';

-- ──────────────────────────────────────────────────────────────────────────────
-- Marketplace domain policy packs (public visibility — available to all orgs).
-- Each pack ships policy templates that get applied org-scoped on install.
-- ──────────────────────────────────────────────────────────────────────────────

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
on conflict (slug) do nothing;
