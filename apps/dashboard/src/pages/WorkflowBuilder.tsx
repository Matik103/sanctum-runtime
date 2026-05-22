import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Play, Save, FileCode } from "lucide-react";
import type { ActionPolicy, PolicyCondition } from "@sanctum-runtime/sdk/browser";
import { api, simulateAction, exportPoliciesYaml, importPoliciesYaml } from "../lib/api";
import { Alert } from "../components/ui/Alert";

type Rule = {
  id: string;
  action: string;
  response: "approve" | "verify" | "block";
  requireSecondApprover: boolean;
  blockWhenOffline: boolean;
  conditions: PolicyCondition[];
  autoEscalateAfterMinutes?: number;
};

const RESPONSE_OPTS: Rule["response"][] = ["approve", "verify", "block"];
const OP_OPTS: PolicyCondition["op"][] = [
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
];
const RESULT_OPTS: PolicyCondition["result"][] = ["approve", "verify", "block"];

function newRule(action = ""): Rule {
  return {
    id: crypto.randomUUID(),
    action,
    response: "verify",
    requireSecondApprover: false,
    blockWhenOffline: false,
    conditions: [],
  };
}

function ruleToPolicy(rule: Rule): Partial<ActionPolicy> {
  return {
    requiresVerification: rule.response === "verify",
    autoBlock: rule.response === "block",
    blockWhenOffline: rule.blockWhenOffline,
    conditions: rule.conditions.length > 0 ? rule.conditions : undefined,
    requireSecondApprover: rule.requireSecondApprover || undefined,
    autoEscalateAfterMinutes: rule.autoEscalateAfterMinutes,
  };
}

export function WorkflowBuilder() {
  const [rules, setRules] = useState<Rule[]>([newRule("")]);
  const [simActor, setSimActor] = useState("agent:test");
  const [simAction, setSimAction] = useState("");
  const [simContext, setSimContext] = useState(
    '{\n  "amount": 1000,\n  "instructionSource": "user"\n}',
  );
  const [simResult, setSimResult] = useState<Awaited<ReturnType<typeof simulateAction>> | null>(
    null,
  );
  const [simError, setSimError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const yaml = useMemo(() => {
    const lines: string[] = [];
    for (const r of rules) {
      if (!r.action.trim()) continue;
      lines.push(`${r.action}:`);
      const p = ruleToPolicy(r);
      lines.push(`  requiresVerification: ${p.requiresVerification ?? false}`);
      lines.push(`  autoBlock: ${p.autoBlock ?? false}`);
      lines.push(`  blockWhenOffline: ${p.blockWhenOffline ?? false}`);
      if (p.requireSecondApprover) lines.push(`  requireSecondApprover: true`);
      if (p.autoEscalateAfterMinutes)
        lines.push(`  autoEscalateAfterMinutes: ${p.autoEscalateAfterMinutes}`);
      if (p.conditions && p.conditions.length) {
        lines.push("  conditions:");
        for (const c of p.conditions) {
          lines.push(`    - field: ${c.field}`);
          lines.push(`      op: ${c.op}`);
          lines.push(`      value: ${typeof c.value === "string" ? `"${c.value}"` : c.value}`);
          lines.push(`      result: ${c.result}`);
        }
      }
      lines.push("");
    }
    return lines.join("\n");
  }, [rules]);

  const update = (id: string, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));

  const addCondition = (id: string) =>
    update(id, {
      conditions: [
        ...(rules.find((r) => r.id === id)?.conditions ?? []),
        { field: "context.amount", op: "gt", value: 1000, result: "verify" },
      ],
    });

  const removeCondition = (ruleId: string, condIdx: number) => {
    const r = rules.find((x) => x.id === ruleId);
    if (!r) return;
    update(ruleId, { conditions: r.conditions.filter((_, i) => i !== condIdx) });
  };

  const updateCondition = (ruleId: string, condIdx: number, patch: Partial<PolicyCondition>) => {
    const r = rules.find((x) => x.id === ruleId);
    if (!r) return;
    update(ruleId, {
      conditions: r.conditions.map((c, i) => (i === condIdx ? { ...c, ...patch } : c)),
    });
  };

  const runSimulation = async () => {
    setSimError(null);
    setSimResult(null);
    try {
      const ctx = JSON.parse(simContext) as Record<string, unknown>;
      const result = await simulateAction(
        simActor,
        simAction || rules[0]?.action || "unknown",
        ctx,
      );
      setSimResult(result);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    }
  };

  const saveWorkflow = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await importPoliciesYaml(yaml, true);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const loadExisting = async () => {
    try {
      const existing = await exportPoliciesYaml();
      void existing;
      alert(
        'Loaded YAML view shows your in-progress workflow. Use "Policies" page to see current saved policies.',
      );
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void api;
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Workflow Builder</h1>
          <p>Compose policies visually, simulate against sample contexts, save as YAML.</p>
        </div>
        <div className="responsive-action-row">
          <button type="button" className="btn btn-ghost" onClick={() => void loadExisting()}>
            <FileCode size={14} style={{ marginRight: "0.35rem" }} /> View YAML
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void saveWorkflow()}>
            <Save size={14} style={{ marginRight: "0.35rem" }} /> Save workflow
          </button>
        </div>
      </header>

      {saveError && (
        <Alert variant="error" onDismiss={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" onDismiss={() => setSaved(false)}>
          Workflow saved.
        </Alert>
      )}

      <div className="workflow-builder">
        <section className="workflow-panel workflow-panel--rules">
          <div className="workflow-panel__header">
            <div>
              <h2>Rules</h2>
              <p>Define the action, response, escalation, and conditional overrides.</p>
            </div>
            <span className="badge neutral">
              {rules.length} {rules.length === 1 ? "rule" : "rules"}
            </span>
          </div>

          {rules.map((rule) => (
            <div key={rule.id} className="workflow-rule">
              <div className="workflow-rule__grid">
                <label className="workflow-field workflow-field--wide">
                  <span>Action</span>
                  <input
                    className="input"
                    value={rule.action}
                    placeholder="transfer_funds"
                    onChange={(e) => update(rule.id, { action: e.target.value })}
                  />
                </label>
                <label className="workflow-field">
                  <span>Response</span>
                  <select
                    className="input"
                    value={rule.response}
                    onChange={(e) =>
                      update(rule.id, { response: e.target.value as Rule["response"] })
                    }
                  >
                    {RESPONSE_OPTS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost workflow-icon-btn"
                  onClick={() => removeRule(rule.id)}
                  aria-label="Remove rule"
                  title="Remove rule"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="workflow-toggle-row">
                <label className="workflow-check">
                  <input
                    type="checkbox"
                    checked={rule.requireSecondApprover}
                    onChange={(e) => update(rule.id, { requireSecondApprover: e.target.checked })}
                  />
                  <span>Require second approver</span>
                </label>
                <label className="workflow-check">
                  <input
                    type="checkbox"
                    checked={rule.blockWhenOffline}
                    onChange={(e) => update(rule.id, { blockWhenOffline: e.target.checked })}
                  />
                  <span>Block when offline</span>
                </label>
                <label className="workflow-field workflow-field--compact">
                  <span>Auto-escalate</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className="input"
                    value={rule.autoEscalateAfterMinutes ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      update(rule.id, { autoEscalateAfterMinutes: v ? Number(v) : undefined });
                    }}
                    placeholder="minutes"
                  />
                </label>
              </div>

              <div className="workflow-conditions">
                <div className="workflow-conditions__header">
                  <span className="card-label">Conditions</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => addCondition(rule.id)}
                  >
                    <Plus size={12} /> Add condition
                  </button>
                </div>
                {rule.conditions.length === 0 && (
                  <p className="workflow-empty">No conditions — rule applies to every call.</p>
                )}
                {rule.conditions.map((c, i) => (
                  <div key={i} className="workflow-condition-row">
                    <input
                      className="input"
                      value={c.field}
                      placeholder="field (e.g. context.amount)"
                      onChange={(e) => updateCondition(rule.id, i, { field: e.target.value })}
                    />
                    <select
                      className="input"
                      value={c.op}
                      onChange={(e) =>
                        updateCondition(rule.id, i, { op: e.target.value as PolicyCondition["op"] })
                      }
                    >
                      {OP_OPTS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={String(c.value)}
                      placeholder="value"
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        const val =
                          e.target.value === ""
                            ? ""
                            : Number.isFinite(num) && /^-?\d/.test(e.target.value)
                              ? num
                              : e.target.value;
                        updateCondition(rule.id, i, { value: val });
                      }}
                    />
                    <select
                      className="input"
                      value={c.result}
                      onChange={(e) =>
                        updateCondition(rule.id, i, {
                          result: e.target.value as PolicyCondition["result"],
                        })
                      }
                    >
                      {RESULT_OPTS.map((r) => (
                        <option key={r} value={r}>
                          to {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost workflow-icon-btn"
                      onClick={() => removeCondition(rule.id, i)}
                      aria-label="Remove condition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-ghost workflow-add-rule"
            onClick={() => setRules((rs) => [...rs, newRule()])}
          >
            <Plus size={14} style={{ marginRight: "0.35rem" }} /> Add rule
          </button>

          <div className="workflow-yaml">
            <strong>YAML preview</strong>
            <pre>{yaml || "# Add an action above to see YAML..."}</pre>
          </div>
        </section>

        <aside className="workflow-panel workflow-panel--simulator">
          <div className="workflow-panel__header">
            <div>
              <h2>Simulator</h2>
              <p>Test a proposed action before saving policy changes.</p>
            </div>
          </div>
          <div className="workflow-simulator">
            <div className="workflow-simulator__grid">
              <label className="workflow-field">
                <span>Actor</span>
                <input
                  className="input"
                  value={simActor}
                  onChange={(e) => setSimActor(e.target.value)}
                />
              </label>
              <label className="workflow-field">
                <span>Action</span>
                <input
                  className="input"
                  value={simAction}
                  placeholder={rules[0]?.action || "transfer_funds"}
                  onChange={(e) => setSimAction(e.target.value)}
                />
              </label>
            </div>
            <label className="workflow-field">
              <span>Context JSON</span>
              <textarea
                className="input workflow-json"
                value={simContext}
                onChange={(e) => setSimContext(e.target.value)}
                rows={7}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary workflow-simulate-btn"
              onClick={() => void runSimulation()}
            >
              <Play size={14} style={{ marginRight: "0.35rem" }} /> Simulate
            </button>
            {simError && (
              <Alert
                variant="error"
                onDismiss={() => setSimError(null)}
                style={{ marginTop: "0.75rem" }}
              >
                {simError}
              </Alert>
            )}
            {simResult && (
              <div className="workflow-result">
                <div
                  style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}
                >
                  <span
                    className={`badge ${simResult.decision === "BLOCKED" ? "danger" : simResult.decision === "REQUIRE_VERIFICATION" ? "warn" : "success"}`}
                  >
                    {simResult.decision}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                    risk: {simResult.risk} · policy: {simResult.policyPath}
                  </span>
                </div>
                {simResult.blastRadius && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem" }}>
                    <strong>Blast radius:</strong> {simResult.blastRadius.level} (
                    {simResult.blastRadius.score}/100)
                    {simResult.blastRadius.factors.length > 0 && (
                      <span style={{ color: "var(--muted)" }}>
                        {" "}
                        · {simResult.blastRadius.factors.join(", ")}
                      </span>
                    )}
                  </p>
                )}
                {simResult.sourceTrust && (
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem" }}>
                    <strong>Source trust:</strong> {simResult.sourceTrust}
                  </p>
                )}
                {simResult.anomalyFlags.length > 0 && (
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem" }}>
                    <strong>Anomalies:</strong> {simResult.anomalyFlags.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
