import type { ActionPolicy, PolicyCondition } from "@sanctum-runtime/sdk";
import type { RuntimeEngine } from "@sanctum/runtime-engine";

const CONDITION_OPS = new Set<PolicyCondition["op"]>([
  "gt",
  "lt",
  "gte",
  "lte",
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "matches",
]);
const CONDITION_RESULTS = new Set<PolicyCondition["result"]>(["block", "verify", "approve"]);

function parseConditions(raw: unknown): PolicyCondition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const conditions: PolicyCondition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const field = typeof c.field === "string" ? c.field.trim() : "";
    const op = c.op;
    const result = c.result;
    const value = c.value;
    if (!field || field.length > 160) continue;
    if (typeof op !== "string" || !CONDITION_OPS.has(op as PolicyCondition["op"])) continue;
    if (typeof result !== "string" || !CONDITION_RESULTS.has(result as PolicyCondition["result"]))
      continue;
    if (!["string", "number", "boolean"].includes(typeof value)) continue;
    conditions.push({
      field,
      op: op as PolicyCondition["op"],
      value: value as string | number | boolean,
      result: result as PolicyCondition["result"],
    });
  }
  return conditions.length > 0 ? conditions : undefined;
}

export function parseMarketplacePolicyTemplate(
  raw: unknown,
): { action: string; patch: Partial<ActionPolicy> } | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const action = String(t.action ?? "").trim();
  if (!action || action.length > 120) return null;

  const patch: Partial<ActionPolicy> = {};
  if (typeof t.requiresVerification === "boolean") {
    patch.requiresVerification = t.requiresVerification;
  }
  if (typeof t.autoBlock === "boolean") {
    patch.autoBlock = t.autoBlock;
  }
  if (typeof t.blockWhenOffline === "boolean") {
    patch.blockWhenOffline = t.blockWhenOffline;
  }
  if (Array.isArray(t.allowedActors)) {
    patch.allowedActors = t.allowedActors.filter((a) => typeof a === "string") as string[];
  }
  if (typeof t.requireSecondApprover === "boolean") {
    patch.requireSecondApprover = t.requireSecondApprover;
  }
  if (Number.isInteger(t.autoEscalateAfterMinutes)) {
    const minutes = t.autoEscalateAfterMinutes as number;
    if (minutes >= 1 && minutes <= 1440) patch.autoEscalateAfterMinutes = minutes;
  }
  if (typeof t.riskPrompt === "string" && t.riskPrompt.trim()) {
    patch.riskPrompt = t.riskPrompt.trim().slice(0, 8000);
  }
  const conditions = parseConditions(t.conditions);
  if (conditions) patch.conditions = conditions;

  return { action, patch };
}

/** Apply org-scoped policies from a marketplace package (`orgId:action` keys). */
export async function applyMarketplacePolicyTemplates(
  runtime: RuntimeEngine,
  orgId: string,
  templates: unknown[],
): Promise<string[]> {
  const applied: string[] = [];
  const engine = runtime.getPolicyEngine();

  for (const raw of templates ?? []) {
    const parsed = parseMarketplacePolicyTemplate(raw);
    if (!parsed) continue;
    const key = `${orgId}:${parsed.action}`;
    await engine.createPolicy(key, parsed.patch);
    applied.push(key);
  }

  return applied;
}

/** Remove policies recorded on install (best-effort, no full-map Supabase upsert). */
export async function removeMarketplacePolicyTemplates(
  runtime: RuntimeEngine,
  policyKeys: string[],
): Promise<void> {
  if (policyKeys.length === 0) return;
  await runtime.removePolicyKeys(policyKeys);
}

export function policyKeysFromInstallConfig(config: Record<string, unknown> | undefined): string[] {
  const raw = config?.appliedPolicyKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string" && k.includes(":"));
}

/** Keys from install record, or rebuild from catalog templates for legacy installs. */
export function policyKeysForUninstall(
  orgId: string,
  config: Record<string, unknown> | undefined,
  templates: unknown[],
): string[] {
  const stored = policyKeysFromInstallConfig(config);
  if (stored.length > 0) return stored;
  const keys: string[] = [];
  for (const raw of templates ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const action = String((raw as { action?: unknown }).action ?? "").trim();
    if (action) keys.push(`${orgId}:${action}`);
  }
  return keys;
}
