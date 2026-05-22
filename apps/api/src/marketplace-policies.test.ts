import { describe, expect, it } from "vitest";
import { parseMarketplacePolicyTemplate } from "./marketplace-policies.js";

describe("parseMarketplacePolicyTemplate", () => {
  it("preserves advanced policy fields from marketplace templates", () => {
    const parsed = parseMarketplacePolicyTemplate({
      action: "send_email",
      requiresVerification: true,
      blockWhenOffline: true,
      allowedActors: ["agent:ops", 42, "agent:finance"],
      requireSecondApprover: true,
      autoEscalateAfterMinutes: 10,
      riskPrompt: "Review source trust.",
      conditions: [
        {
          field: "context.instructionSource",
          op: "eq",
          value: "tool_output",
          result: "block",
        },
        {
          field: "context.amount",
          op: "gte",
          value: 5000,
          result: "verify",
        },
      ],
    });

    expect(parsed).toEqual({
      action: "send_email",
      patch: {
        requiresVerification: true,
        blockWhenOffline: true,
        allowedActors: ["agent:ops", "agent:finance"],
        requireSecondApprover: true,
        autoEscalateAfterMinutes: 10,
        riskPrompt: "Review source trust.",
        conditions: [
          {
            field: "context.instructionSource",
            op: "eq",
            value: "tool_output",
            result: "block",
          },
          {
            field: "context.amount",
            op: "gte",
            value: 5000,
            result: "verify",
          },
        ],
      },
    });
  });

  it("drops malformed conditions without rejecting the template", () => {
    const parsed = parseMarketplacePolicyTemplate({
      action: "execute_shell",
      requiresVerification: true,
      conditions: [
        { field: "context.destination", op: "eq", value: "external", result: "verify" },
        { field: "", op: "eq", value: true, result: "verify" },
        { field: "context.amount", op: "bad", value: 1, result: "verify" },
      ],
    });

    expect(parsed?.patch.conditions).toEqual([
      { field: "context.destination", op: "eq", value: "external", result: "verify" },
    ]);
  });
});
