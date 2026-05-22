# Robotics & ROS2 safety with Sanctum

Physical actions are irreversible in a way that software actions are not.
A robot arm that crushes a fixture can't be "rolled back." A locomotion
command sent into an uncontrolled environment can hurt people. The boundary
between *the planner says move* and *the motors actually run* has to be
deterministic, signed, and auditable.

Sanctum sits there.

## Architecture

```
   ┌──────────────┐       ┌──────────┐       ┌────────────┐
   │  Planner /   │──────▶│ Sanctum  │──────▶│ ROS2 node  │
   │  LLM agent   │       │  gate    │  ✅   │ publishes  │
   └──────────────┘       └──────────┘       └────────────┘
                              │
                              ▼
                       audit + evidence
                       (blast: critical,
                        physicalWorld: true)
```

Every move command, manipulator actuation, door unlock, or safety-sensor
toggle passes through Sanctum first. The blast-radius estimator scores
physical-world actions as `critical` by default. The
`robotics-ros2-safety` policy pack auto-blocks the most dangerous primitives.

## Install the policy pack

```bash
curl -X POST $SANCTUM_API/v1/marketplace/install \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{ "slug": "robotics-ros2-safety", "orgId": "your-org" }'
```

What it does:

- `move_robot`, `actuate_manipulator`, `autonomous_navigation` → require operator
  approval, **block when offline** (no telemetry = no consent)
- `unlock_door`, `share_health_data` → require verification
- `emergency_stop` → **always allowed** instantly (safety-critical)
- `disable_safety_sensor`, `override_speed_limit` → **always blocked**

## Wire it into your ROS2 node

```ts
import { wrapRos2Dispatcher } from '@sanctum-runtime/adapters/ros2'
import { SanctumClient } from '@sanctum-runtime/sdk'

const sanctum = new SanctumClient({ baseUrl: process.env.SANCTUM_API })

const safePublish = wrapRos2Dispatcher(
  (topic, msg) => publisher.publish(topic, msg),
  { client: sanctum, agentId: 'ros2:nav_planner' },
)

await safePublish('/cmd_vel', { linear: { x: 0.5 } })
//   ↑ blocked unless policy approves OR operator clicks Approve on their phone
```

The adapter automatically stamps `physicalWorld: true` and `reversible: false`
in the action context, so blast radius scores as critical even without a
custom policy.

## Compliance mapping

This pack is designed against:

- **ISO 10218** — Robot safety
- **IEC 62061** — Functional safety
- **ROS 2 SROS2** security best practices
- **NIST AI RMF MANAGE 2.2** — Incident response (operator-triggered pause)

The **fleet kill switch** (mobile dashboard, top-right) blocks every action
across every robot in the org instantly. Use it during a near-miss while the
incident team investigates.

## Embodied / humanoid stack

Same primitives work for humanoid platforms (Tesla Optimus-style stacks,
Figure, Apptronik, Unitree). The adapter is dispatcher-agnostic — wrap any
function that publishes / sends a goal / calls a service.

For non-ROS robotics (Boston Dynamics SDK, ABB RobotWare, KUKA KRC) use the
generic `gate()` function — same shape, same guarantees.
