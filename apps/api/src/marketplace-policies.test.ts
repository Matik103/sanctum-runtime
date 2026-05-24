import { describe, expect, it } from "vitest";
import { RuntimeEngine } from "@sanctum/runtime-engine";
import {
  applyMarketplacePolicyTemplates,
  parseMarketplacePolicyTemplate,
  snapshotMarketplacePolicyTemplates,
  uninstallMarketplacePolicyTemplates,
} from "./marketplace-policies.js";

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

describe("marketplace policy lifecycle", () => {
  it("restores a replaced organization policy when a template is uninstalled", async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true });
    const key = "org-1:send_email";
    await runtime.getPolicyEngine().createPolicy(key, {
      requiresVerification: true,
      autoBlock: false,
      riskPrompt: "Operator-authored policy",
    });
    const templates = [{ action: "send_email", autoBlock: true }];

    const replacedPolicies = snapshotMarketplacePolicyTemplates(runtime, "org-1", templates);
    const applied = await applyMarketplacePolicyTemplates(runtime, "org-1", templates);
    expect(runtime.getPolicyEngine().getPolicies()[key].autoBlock).toBe(true);

    await uninstallMarketplacePolicyTemplates(runtime, applied, { replacedPolicies });
    expect(runtime.getPolicyEngine().getPolicies()[key]).toMatchObject({
      requiresVerification: true,
      autoBlock: false,
      riskPrompt: "Operator-authored policy",
    });
  });

  it("removes a newly introduced template policy on uninstall", async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true });
    const templates = [{ action: "deploy_service", requiresVerification: true }];
    const replacedPolicies = snapshotMarketplacePolicyTemplates(runtime, "org-1", templates);
    const applied = await applyMarketplacePolicyTemplates(runtime, "org-1", templates);

    await uninstallMarketplacePolicyTemplates(runtime, applied, { replacedPolicies });
    expect(runtime.getPolicyEngine().getPolicies()["org-1:deploy_service"]).toBeUndefined();
  });

  it("restores only backed-up keys from install configuration", async () => {
    const runtime = new RuntimeEngine({ forceOfflineMode: true });
    await runtime.getPolicyEngine().createPolicy("org-1:send_email", { autoBlock: true });

    await uninstallMarketplacePolicyTemplates(runtime, ["org-1:send_email"], {
      replacedPolicies: {
        "org-1:send_email": { requiresVerification: true, autoBlock: false },
        "org-1:unrelated": { autoBlock: true },
      },
    });

    expect(runtime.getPolicyEngine().getPolicies()["org-1:send_email"].requiresVerification).toBe(true);
    expect(runtime.getPolicyEngine().getPolicies()["org-1:unrelated"]).toBeUndefined();
  });
});
