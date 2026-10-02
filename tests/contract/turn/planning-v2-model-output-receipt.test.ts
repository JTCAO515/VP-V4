import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningV2ModelOutputReceipt as create, parsePlanningV2ModelOutputReceipt as parse } from "../../../lib/server/turn/planning-v2-model-output-receipt.ts";
const id = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
function fixture() {
  const binding = { owner: id(1), task: id(2), turn: id(3), lease: id(4), textPolicy: id(5), planningPolicy: id(6), scope: id(7), attempt: id(8), provider: "qwen", model: "synthetic-model", priceVersion: "synthetic-v1", intakeDigest: "a".repeat(64), planningDigest: "b".repeat(64) };
  const usageReceipt = { schemaVersion: "validated-planning-usage/1", attempt: { scopeId: binding.scope, ownerId: binding.owner, taskId: binding.task, attemptId: binding.attempt, provider: "qwen", model: binding.model, priceVersion: binding.priceVersion, reservedMicros: 10, timeoutMs: 1000 }, turnId: binding.turn, policyId: binding.planningPolicy,
    usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20, cachedInputTokens: null as number | null, uncachedInputTokens: null as number | null, reasoningTokens: null as number | null, cost: "unknown" }, actualMicros: 0, observedAt: "2026-10-03T00:00:00.000Z" };
  return { expected: structuredClone(binding), raw: { schemaVersion: "planning-v2-model-output/1", binding, usageReceipt, output: { highlight: "none" }, observedAt: "2026-10-03T00:00:01.000Z" } };
}
const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;

test("known zero and nullable token counts survive closed constructor/wire roundtrip with no execution authority", () => {
  const { raw, expected } = fixture(), r = create(raw, expected); assert.ok(r); assert.equal(r.usageReceipt.actualMicros, 0); assert.equal(r.usageReceipt.usage.cachedInputTokens, null);
  assert.equal(r.executionAvailable, false); assert.equal(r.readyForPublication, false); assert.deepEqual(parse(r, expected), r);
  assert.ok(Object.isFrozen(r.binding)); assert.ok(Object.isFrozen(r.usageReceipt.attempt)); assert.ok(Object.isFrozen(r.output));
  raw.binding.lease = id(99); raw.usageReceipt.actualMicros = 9; raw.output.highlight = "jingan"; assert.equal(r.binding.lease, id(4)); assert.equal(r.usageReceipt.actualMicros, 0); assert.equal(r.output.highlight, "none");
});
test("all thirteen independent expected fields and every usage attempt/turn/planning-policy identity must match", () => {
  const { raw, expected } = fixture();
  for (const [index, k] of Object.keys(expected).entries()) assert.equal(create(raw, { ...expected, [k]: index < 8 ? id(99) : k.endsWith("Digest") ? "c".repeat(64) : "different" }), null, k);
  for (const k of ["scopeId", "ownerId", "taskId", "attemptId", "provider", "model", "priceVersion"]) assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, attempt: { ...raw.usageReceipt.attempt, [k]: k.endsWith("Id") ? id(99) : "different" } } }, expected), null, k);
  for (const k of ["turnId", "policyId"]) assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, [k]: id(99) } }, expected), null);
});
test("enum arrays, unknown keys, supplied hashes/flags and invalid UTC millisecond timestamps fail closed", () => {
  const { raw, expected } = fixture();
  for (const output of [{ highlight: ["none"] }, { highlight: "none", prose: "Suitable for you" }, { highlight: "hotel" }, { highlight: null }, ["none"]]) assert.equal(create({ ...raw, output }, expected), null);
  assert.equal(create({ ...raw, binding: { ...raw.binding, provider: ["qwen"] } }, expected), null);
  assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, attempt: { ...raw.usageReceipt.attempt, provider: ["qwen"] } } }, expected), null);
  for (const observedAt of ["2026-02-30T00:00:00.000Z", "2026-10-03T00:00:00Z", "2026-10-03T00:00:00.000+00:00", "2026-10-03T00:00:00.0000Z", "invalid"]) assert.equal(create({ ...raw, observedAt }, expected), null);
  for (const [k, v] of [["outputDigest", "a".repeat(64)], ["executionAvailable", false], ["extra", true]]) assert.equal(create({ ...raw, [k as string]: v }, expected), null);
  assert.equal(create({ ...raw, binding: { ...raw.binding, extra: true } }, expected), null);
  assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, attempt: { ...raw.usageReceipt.attempt, extra: true } } }, expected), null);
  assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, extra: true } }, expected), null); assert.equal(create(raw, { ...expected, extra: true }), null);
  const r = create(raw, expected); assert.ok(r); for (const bad of [{ ...r, extra: true }, { ...r, executionAvailable: true }, { ...r, readyForPublication: [false] }, { ...r, outputDigest: "0".repeat(64) }, { ...r, usageDigest: "0".repeat(64) }]) assert.equal(parse(bad, expected), null);
});
test("existing usage tariff/token invariants reject unknown money instead of inventing zero", () => {
  const { raw, expected } = fixture();
  for (const actualMicros of [null, "0", -1, 0.1, Infinity, 1e12 + 1]) assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, actualMicros } }, expected), null);
  for (const patch of [{ totalTokens: 21 }, { cachedInputTokens: 13 }, { uncachedInputTokens: 13 }, { cachedInputTokens: 5, uncachedInputTokens: 6 }, { reasoningTokens: 9 }, { cost: "free" }, { inputTokens: -1 }, { outputTokens: [8] }]) assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, usage: { ...raw.usageReceipt.usage, ...patch } } }, expected), null);
  for (const patch of [{ reservedMicros: 0 }, { reservedMicros: 1e12 + 1 }, { timeoutMs: 0 }, { timeoutMs: 300001 }]) assert.equal(create({ ...raw, usageReceipt: { ...raw.usageReceipt, attempt: { ...raw.usageReceipt.attempt, ...patch } } }, expected), null);
  const valid = create({ ...raw, usageReceipt: { ...raw.usageReceipt, usage: { ...raw.usageReceipt.usage, cachedInputTokens: 0, uncachedInputTokens: 12, reasoningTokens: 0 }, actualMicros: 7 } }, expected); assert.ok(valid); assert.equal(valid.usageReceipt.actualMicros, 7);
});
test("module-computed digests ignore object order and detect output or usage changes separately", () => {
  const { raw, expected } = fixture(), r = create(raw, expected); assert.ok(r); assert.deepEqual(create(reverse(raw), reverse(expected)), r); assert.deepEqual(parse(reverse(r), expected), r);
  const changed = create({ ...raw, output: { highlight: "jingan" } }, expected); assert.ok(changed); assert.notEqual(changed.outputDigest, r.outputDigest); assert.equal(changed.usageDigest, r.usageDigest);
  const paid = create({ ...raw, usageReceipt: { ...raw.usageReceipt, actualMicros: 1 } }, expected); assert.ok(paid); assert.notEqual(paid.usageDigest, r.usageDigest); assert.equal(paid.outputDigest, r.outputDigest);
  assert.equal(parse({ ...r, output: changed.output }, expected), null); assert.equal(parse({ ...r, usageReceipt: paid.usageReceipt }, expected), null);
});

test("output binding/expected and usage identities require canonical lowercase UUIDs",()=>{
 const lower="abcdef00-0000-0000-0000-000000000001",upper=lower.toUpperCase();
 for(const [k,u]of [["owner","ownerId"],["task","taskId"],["scope","scopeId"],["attempt","attemptId"],["turn","turnId"],["planningPolicy","policyId"],["lease",null],["textPolicy",null]] as const){
  const {raw,expected}=fixture(),b={...raw.binding,[k]:lower};
  const usageReceipt={...raw.usageReceipt,attempt:{...raw.usageReceipt.attempt,...(u&&u!=="turnId"&&u!=="policyId"?{[u]:lower}:{})},...(u==="turnId"||u==="policyId"?{[u]:lower}:{})};
  const input={...raw,binding:b,usageReceipt};assert.ok(create(input,{...expected,[k]:lower}));
  assert.equal(create({...input,binding:{...b,[k]:upper}},{...expected,[k]:upper}),null,k);
  assert.equal(create(input,{...expected,[k]:upper}),null,k);
  if(u){const bad={...usageReceipt,...(u==="turnId"||u==="policyId"?{[u]:upper}:{}),attempt:{...usageReceipt.attempt,...(u!=="turnId"&&u!=="policyId"?{[u]:upper}:{})}};assert.equal(create({...input,usageReceipt:bad},{...expected,[k]:lower}),null,u);}
 }
});
