import assert from "node:assert/strict";
import test from "node:test";
import { recordedUsageTrace } from "../../../../evals/harness/recorded/usage-trace.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function recording() {
  const receipt = { schemaVersion: "validated-model-usage/1", turnId: id(1), policyId: id(2),
    attempt: { scopeId: id(3), ownerId: id(4), taskId: id(1), attemptId: id(5), provider: "qwen", model: "qwen-test", priceVersion: "frozen-test-v1", reservedMicros: 1000, timeoutMs: 1000 },
    usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: null, uncachedInputTokens: null, reasoningTokens: null, cost: "unknown" },
    actualMicros: 12, observedAt: "2026-09-13T01:00:00.000Z" };
  return { schemaVersion: "vpj67-recorded-usage-input/1", recordedAt: "2026-09-13T02:00:00.000Z", apiSha: "a".repeat(40), workerSha: "b".repeat(40), configurationDigest: "c".repeat(64), prompt: { version: "test-v1", digest: "d".repeat(64) }, binding: { ownerId: id(4), serviceTaskId: id(6), turnId: id(1), policyId: id(2) }, taskRecord: { id: id(6), ownerId: id(4), policyId: id(2) } as { id: string; ownerId: string; policyId: string } | null, turnLink: { turnId: id(1), taskId: id(6), ownerId: id(4) } as { turnId: string; taskId: string; ownerId: string } | null, budgetScopes: [{ id: id(3), ownerId: id(4), currency: "CNY" }], attempts: [{ provider: "qwen", model: "qwen-test", priceVersion: "frozen-test-v1", reservedMicros: 1000, attemptId: id(5), scopeId: id(3), ledgerTaskId: id(6), status: "settled", actualMicros: 12 as number | null, usageReceipt: receipt as typeof receipt | null }] };
}
test("links separate ServiceTask and Turn identifiers without claiming live acceptance or an invoice", () => {
  const r = recordedUsageTrace(recording());
  assert.equal(r.traceValidation, "PASS"); assert.equal(r.mode, "recorded-staging");
  assert.equal(r.attempts[0].workerTaskId, id(1)); assert.equal(r.attempts[0].ledgerTaskId, id(6));
  assert.equal(r.attempts[0].currency, "CNY"); assert.equal(r.attempts[0].vendorCost, "unknown"); assert.equal(r.currentAuthorization, "NOT_RECHECKED");
  assert.equal(r.fullAcceptance, "NOT_RUN"); assert.equal(r.providerCallsMade, 0);
});
test("rejects swapped identity, task, attempt, price, token count and timestamps", () => {
  const mutations: ((r: ReturnType<typeof recording>) => void)[] = [
    r => { r.binding.ownerId = id(9); }, r => { r.binding.turnId = id(9); },
    r => { r.binding.policyId = id(9); }, r => { r.attempts[0].ledgerTaskId = id(1); },
    r => { r.attempts[0].attemptId = id(9); }, r => { r.attempts[0].scopeId = id(9); },
    r => { r.attempts[0].actualMicros = 13; },
    r => { r.attempts[0].provider = "glm"; }, r => { r.attempts[0].model = "other"; },
    r => { r.attempts[0].priceVersion = "other"; }, r => { r.attempts[0].reservedMicros = 2000; },
    r => { r.taskRecord!.ownerId = id(9); }, r => { r.taskRecord!.policyId = id(9); },
    r => { r.turnLink!.taskId = id(9); }, r => { r.turnLink!.turnId = id(9); },
    r => { r.turnLink!.ownerId = id(9); }, r => { r.budgetScopes[0].ownerId = id(9); }, r => { r.budgetScopes[0].currency = "invalid"; },
    r => { r.attempts[0].usageReceipt!.usage.totalTokens = 13; },
    r => { r.recordedAt = "2026-09-13T00:00:00.000Z"; },
    r => { r.attempts.push(structuredClone(r.attempts[0])); },
  ];
  for (const mutation of mutations) { const r = recording(); mutation(r); assert.throws(() => recordedUsageTrace(r)); }
});
test("unknown or unsettled usage stays incomplete and never becomes zero cost", () => {
  for (const status of ["reserved", "dispatched", "pending", "released"]) {
    const r = recording(); r.attempts[0].status = status; r.attempts[0].actualMicros = null; r.attempts[0].usageReceipt = null;
    const report = recordedUsageTrace(r); assert.equal(report.traceValidation, "INCOMPLETE");
    assert.equal(report.attempts[0].tariffMicros, "unknown"); assert.equal(report.attempts[0].usage, "unknown");
  }
  const r = recording(); r.attempts = []; assert.equal(recordedUsageTrace(r).traceValidation, "INCOMPLETE");
});
test("rejects extra fields so recordings cannot copy secret or prompt bodies to reports", () => {
  assert.throws(() => recordedUsageTrace({ ...recording(), rawPrompt: "private" }));
  const r = recording(); Object.assign(r.attempts[0].usageReceipt!, { token: "secret" });
  assert.throws(() => recordedUsageTrace(r));
  assert.throws(() => recordedUsageTrace({ ...recording(), recordedAt: "2026-02-30T02:00:00.000Z" }));
});

test("missing recorded links cannot certify a task trace", () => {
  for (const mutation of [
    (r: ReturnType<typeof recording>) => { r.taskRecord = null; },
    (r: ReturnType<typeof recording>) => { r.turnLink = null; },
    (r: ReturnType<typeof recording>) => { r.budgetScopes = []; },
  ]) { const r = recording(); mutation(r); assert.equal(recordedUsageTrace(r).traceValidation, "INCOMPLETE"); }
});

test("CLI contains malformed-input diagnostics without leaking source text", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "vpj67-recorded-"));
  try {
    const path = join(dir, "input.json");
    writeFileSync(path, '{"private":"NEVER_ECHO_THIS_SECRET",broken');
    const cli = new URL("../../../../scripts/harness-recorded-usage.mjs", import.meta.url);
    const bad = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(cli), path], { encoding: "utf8" });
    assert.equal(bad.status, 1); assert.equal(bad.stdout, ""); assert.ok(!bad.stderr.includes("NEVER_ECHO_THIS_SECRET"));
    writeFileSync(path, JSON.stringify(recording()));
    const good = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(cli), path], { encoding: "utf8" });
    assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).mode, "recorded-staging");
    const incomplete = recording(); incomplete.turnLink = null; writeFileSync(path, JSON.stringify(incomplete));
    const missing = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(cli), path], { encoding: "utf8" });
    assert.equal(missing.status, 2); assert.equal(JSON.parse(missing.stdout).traceValidation, "INCOMPLETE");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
