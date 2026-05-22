-- Marketplace trust-boundary policy packs.
-- These packs map the newer Sanctum product surface into installable categories:
-- source-trust defense, action-token enforcement, policy replay, compliance evidence,
-- cloud/ops agents, and modern agent SDK stacks.

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
