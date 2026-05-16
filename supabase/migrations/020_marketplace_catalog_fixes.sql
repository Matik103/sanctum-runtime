-- Harden the three public marketplace packages (policies, connect defaults, readmes).

update public.runtime_packages
set
  description = 'General-purpose AI agent runtime — connect, register agents, and gate tool use with org policies.',
  connect_defaults = '{
    "mode": "cloud",
    "region": "us-east",
    "metadata": { "package": "sanctum-agent-host" },
    "suggestedRuntimeName": "agent-host-01",
    "agents": [
      {
        "id": "default_agent",
        "model": "gpt-4o-mini",
        "permissions": ["read", "verify", "send_email"]
      }
    ]
  }'::jsonb,
  policy_templates = '[
    { "action": "send_email", "requiresVerification": true },
    { "action": "delete_file", "requiresVerification": true },
    { "action": "execute_terminal", "autoBlock": true },
    { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true }
  ]'::jsonb,
  readme = '1. Install for your org (dashboard or API). 2. connectFromPackage(''sanctum-agent-host'', orgId). 3. verifyAction with actor default_agent — policies apply on install.',
  updated_at = now()
where slug = 'sanctum-agent-host';

update public.runtime_packages
set
  description = 'Warehouse AMR template — edge mode, navigation agent, movement and door policies.',
  connect_defaults = '{
    "mode": "edge",
    "region": "us-west",
    "metadata": { "package": "warehouse-robot" },
    "suggestedRuntimeName": "warehouse-bot-01",
    "agents": [
      {
        "id": "navigation",
        "model": "gpt-4o",
        "permissions": ["movement", "camera_access"]
      }
    ]
  }'::jsonb,
  policy_templates = '[
    { "action": "move_robot", "requiresVerification": false },
    { "action": "unlock_door", "requiresVerification": true },
    { "action": "disable_alarm", "requiresVerification": true, "blockWhenOffline": true }
  ]'::jsonb,
  readme = '1. Install for your org. 2. connectFromPackage(''warehouse-robot'', orgId) registers agent navigation. 3. Gate moves with action move_robot and actor navigation.',
  updated_at = now()
where slug = 'warehouse-robot';

update public.runtime_packages
set
  description = 'Hybrid IoT gateway — telemetry agent, alarm and offline-sensitive policies.',
  connect_defaults = '{
    "mode": "hybrid",
    "region": "edge-local",
    "metadata": { "package": "edge-sensor-gateway" },
    "suggestedRuntimeName": "sensor-gw-01",
    "agents": [
      {
        "id": "telemetry",
        "model": "gpt-4o-mini",
        "permissions": ["read"]
      }
    ]
  }'::jsonb,
  policy_templates = '[
    { "action": "disable_alarm", "requiresVerification": true, "blockWhenOffline": true },
    { "action": "access_database", "requiresVerification": true, "blockWhenOffline": true }
  ]'::jsonb,
  readme = '1. Install for your org. 2. connectFromPackage(''edge-sensor-gateway'', orgId). 3. emitEvent from agent telemetry; alarm changes use disable_alarm with verification.',
  updated_at = now()
where slug = 'edge-sensor-gateway';
