# CrewAI — verify before crew tools

Wrap CrewAI tool functions so every physical or privileged action passes through Sanctum first.

## Install

```bash
pip install sanctum-runtime crewai
```

## Tool wrapper

```python
import os
from functools import wraps
from sanctum_runtime import SanctumRuntime, SanctumActionBlockedError

runtime = SanctumRuntime()

def sanctum_gated(action: str):
    """Decorator for CrewAI @tool functions."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            actor = os.environ.get("SANCTUM_ACTOR", "crewai-agent")
            result = runtime.verify_action({
                "actor": actor,
                "action": action,
                "context": {"args": list(args), "kwargs": kwargs},
            })
            if result["decision"] == "REQUIRE_VERIFICATION":
                return {
                    "status": "verification_required",
                    "correlationId": result["correlationId"],
                    "message": result.get("reasoning", ""),
                }
            return fn(*args, **kwargs)
        return wrapper
    return decorator
```

## Example task tool

```python
from crewai.tools import tool

@tool("Move robot arm to pick position")
@sanctum_gated("robot_arm_move")
def move_arm(x: float, y: float, z: float) -> str:
    # Real ROS / SDK call only runs after APPROVED
    return f"Moved to ({x},{y},{z})"
```

## Crew-level actor

Set `SANCTUM_ACTOR=my-crew-warehouse` in env so audit logs identify which crew ran the action.

## Policies

| Action | Suggested mode |
|--------|----------------|
| `read_sensor` | Approve |
| `robot_arm_move` | Verify |
| `emergency_stop` | Approve (never block) |

Configure in dashboard **Policies** or import [policies.example.yaml](../../examples/policies.example.yaml).
