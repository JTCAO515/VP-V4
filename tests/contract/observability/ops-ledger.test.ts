import test from "node:test";
import assert from "node:assert/strict";
import { readOpsLedgerScope, parseOpsLedgerSnapshot } from "../../../lib/server/observability/ops-ledger.ts";
import { renderOpsLedgerReport } from "../../../apps/ops/ledger-report.ts";

const id = "11111111-1111-4111-8111-111111111111";
function snapshot() {
  const attempts = { total: 3, reserved: 0, dispatched: 0, pending: 2, settled: 1, released: 0 };
  const money = { settledMicros: "17", holdMicros: "20000000000000000", exposureMicros: "20000000000000017" };
  return {
    kind: "snapshot", schemaVersion: "ops-budget-scope/v1", observedAt: "2026-09-11T00:00:00+00:00",
    scope: { currency: "CNY", enabled: true, frozen: false, expired: false }, attempts, money,
    providers: [{ provider: "qwen", attempts: { ...attempts }, money: { ...money } }],
    tasks: { total: 2, linkedTurns: 1, missingTurns: 1, ownerMismatch: 0,
      technical: { active: 0, completed: 1, proposalReady: 0, unavailable: 0, failed: 0, cancelled: 0, unknown: 1 },
      business: { answered: 0, partial: 1, clarification: 0, blocked: 0, technicalFailure: 0, unobserved: 1 } },
    integrity: { inconsistentOutcomeTasks: 0, duplicateTerminalTasks: 0 },
    unobserved: { actualBilledMicros: null, providerLatencyMs: null, toolAttempts: null, humanTimeMs: null, semanticQuality: null, serviceTaskCount: null },
  };
}

test("consumer preserves unknown holds without floating-point loss and separates partial from terminal completion", async () => {
  const raw = snapshot();
  const result = await readOpsLedgerScope(async (name, params) => {
    assert.equal(name, "read_ops_budget_scope_v1"); assert.deepEqual(params, { p_scope_id: id }); return raw;
  }, id);
  assert.equal(result.kind, "available");
  if (result.kind !== "available") return;
  assert.deepEqual(result.findings, ["unknown_cost_hold", "unlinked_tasks"]);
  assert.equal(result.snapshot.money.exposureMicros, "20000000000000017");
  assert.equal(result.snapshot.tasks.business.partial, 1);
  assert.equal(result.snapshot.tasks.business.answered, 0);
  const report = renderOpsLedgerReport(result.snapshot);
  assert.match(report, /ServiceTask count: unknown/);
  assert.match(report, /semantic quality: unknown/);
  assert.match(report, /partial=1/);
  assert.doesNotMatch(report, new RegExp(id));
});

test("unavailable transport or a malformed scope returns no row or raw error", async () => {
  let calls = 0;
  const rpc = async () => { calls++; throw new Error("secret database connection details"); };
  assert.deepEqual(await readOpsLedgerScope(rpc, "raw owner input"), { kind: "unavailable" }); assert.equal(calls, 0);
  assert.deepEqual(await readOpsLedgerScope(rpc, id), { kind: "unavailable" });
  assert.deepEqual(await readOpsLedgerScope(async () => ({ kind: "unavailable" }), id), { kind: "unavailable" });
});

test("allowlist and reconciliation reject content, invented zeros, duplicated providers and inconsistent joins", () => {
  const changes = [
    (s: ReturnType<typeof snapshot>) => Object.assign(s, { input_text: "Private body" }),
    (s: ReturnType<typeof snapshot>) => Object.assign(s.scope, { ownerId: id }),
    (s: ReturnType<typeof snapshot>) => Object.assign(s.unobserved, { semanticQuality: 0 }),
    (s: ReturnType<typeof snapshot>) => { s.providers.push(structuredClone(s.providers[0])); },
    (s: ReturnType<typeof snapshot>) => { s.providers[0].attempts.pending = 1; },
    (s: ReturnType<typeof snapshot>) => { s.money.exposureMicros = "20000000000000018"; },
    (s: ReturnType<typeof snapshot>) => { s.tasks.business.answered = 1; },
    (s: ReturnType<typeof snapshot>) => { s.tasks.total = 4; },
    (s: ReturnType<typeof snapshot>) => { s.attempts.total = Number.MAX_SAFE_INTEGER + 1; },
  ];
  for (const change of changes) {
    const value = snapshot(); change(value);
    assert.throws(() => parseOpsLedgerSnapshot(value), /Invalid operational ledger snapshot/);
    assert.throws(() => renderOpsLedgerReport(value), /Invalid operational ledger snapshot/);
  }
});
