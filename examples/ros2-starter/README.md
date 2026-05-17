# ROS 2 starter (preset)

Gate robot commands through Sanctum before they reach your ROS 2 action servers.

**Marketplace:** install template `ros2-mobile` in the dashboard, then `connectFromPackage('ros2-mobile', orgId)` — or run `npm run example:marketplace:ros2`.

## Pattern

1. ROS node receives a high-level command (e.g. `move_arm`).
2. Call Sanctum `verify_action` with `actor` = robot id and `context` = pose, zone, operator.
3. Only publish to ROS if decision is `APPROVED`.

## Python (recommended on Jetson / Pi)

```bash
pip install sanctum-runtime
export SANCTUM_API_URL=https://your-api.onrender.com
export SANCTUM_API_KEY=sk_sanctum_...
```

```python
from sanctum_runtime import SanctumRuntime

runtime = SanctumRuntime()

def gated_move(robot_id: str, x: float, y: float, z: float) -> bool:
    result = runtime.verify_action({
        "actor": robot_id,
        "action": "robot_arm_move",
        "context": {"x": x, "y": y, "z": z},
    })
    return result["decision"] == "APPROVED"
```

Set policy `robot_arm_move` → **Verify** in the dashboard for human-in-the-loop demos.

## Next steps

- Wire your existing `rclpy` action client after `APPROVED`.
- Use org-scoped policies (`org_id` in context) for fleet deployments.
- See [docs/integrations](../../docs/integrations/) for LangChain / MCP patterns on the planning layer.
