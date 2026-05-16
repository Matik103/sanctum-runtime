#!/usr/bin/env python3
"""Example: verify an action against a running Sanctum API."""

import json
import os
import sys

from sanctum_runtime import SanctumClient

def main() -> None:
    base = os.environ.get("SANCTUM_API_URL", "http://127.0.0.1:3001")
    client = SanctumClient(base_url=base, api_key=os.environ.get("SANCTUM_API_KEY"))

    result = client.verify_action(
        {
            "actor": "example-python-agent",
            "action": "read_calendar",
            "context": {"intent": "Check morning meetings"},
        },
        offline_mode=True,
    )
    print(json.dumps(result, indent=2))
    sys.exit(0 if result.get("decision") != "BLOCKED" else 1)


if __name__ == "__main__":
    main()
