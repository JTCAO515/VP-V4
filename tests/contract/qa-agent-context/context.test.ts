import test from "node:test";
import assert from "node:assert/strict";
import { assembleQaSessionContext, invokeQaSessionContext, type QaSessionContextRpc } from "../../../lib/server/qa-agent-context/session.ts";
import { type QaContextBinding } from "../../../lib/server/qa-agent-context/index.ts";
import { createQaContextInvoker } from "../../../lib/server/qa-agent-context/executor-adapter.ts";
import { TEXT_TASK_SYSTEM_PROMPT } from "../../../lib/server/model-gateway/prompt/text-turn.ts";
import { budget, completion } from "../model-gateway/provider-protocol/fixtures.ts";
import type { ProtocolTransport } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";

const id = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const binding: QaContextBinding = { actorId: id(1), authSessionId: id(9), sessionId: id(2), taskId: id(3), scopeVersion: 1, turnId: id(4), policyId: id(5), consentId: id(6), provider: "qwen", endpoint: "https://fixture.invalid/v1/chat/completions" };
function fixture(text = "为什么？", pairs = 1) {
  const history = Array.from({ length: pairs }, (_, i) => [
    { turnId: id(10 + i), role: "user", content: i === 0 ? "上海两日，以美食为主。" : `第${i + 1}次追问` },
    { turnId: id(10 + i), role: "assistant", content: i === 0 ? "方案一慢游；方案二看更多街区。" : `第${i + 1}次回答` },
  ]).flat();
  return { kind: "qa_input", schemaVersion: "qa-context/1", contextMode: "qa_session_history_v1", ownerId: binding.actorId, authSessionId: binding.authSessionId, turnId: binding.turnId, threadId: binding.sessionId,
    serviceTaskId: binding.taskId, policyId: binding.policyId, consentId: binding.consentId,
    provider: binding.provider, endpoint: binding.endpoint, text, locale: "zh", history,
    sourceTurnIds: [binding.turnId, ...Array.from({ length: pairs }, (_, i) => id(10 + pairs - 1 - i))], contextDigest: "a".repeat(64) };
}

test("P0 why/simplify/second-option/correction preserve exact history and latest request without creating a task", () => {
  for (const text of ["为什么？", "简单一点", "选第二个方案", "纠正一下：不是上海，是广州。", "Why?", "Simplify", "The second option", "Correction: Guangzhou, not Shanghai."]) {
    const raw = fixture(text), result = assembleQaSessionContext(binding, raw);
    assert.equal(result.gatewayInput.text, text);
    assert.deepEqual(result.gatewayInput.history, raw.history.map(({ role, content }) => ({ role, content })));
    assert.equal(result.manifest.taskId, binding.taskId); assert.equal(result.manifest.scopeVersion, 1);
    assert.equal(result.manifest.sources.at(-1)?.turnId, binding.turnId);
    assert.ok(!JSON.stringify(result.manifest).includes(text)); assert.ok(Object.isFrozen(result.gatewayInput.history[0]));
  }
});
test("new Session sends no history; original Session/Task/policy/consent/Turn binding is exact", () => {
  assert.deepEqual(assembleQaSessionContext(binding, fixture("新问题", 0)).gatewayInput.history, []);
  for (const field of ["threadId", "serviceTaskId", "policyId", "consentId", "turnId", "ownerId", "authSessionId"]) {
    assert.throws(() => assembleQaSessionContext(binding, { ...fixture(), [field]: id(90) }), /DATA_POLICY_BLOCKED/);
  }
});
test("bounded permitted upstream history selects exactly the three most recent whole pairs", () => {
  const raw = fixture("纠正：广州", 7), result = assembleQaSessionContext(binding, raw);
  assert.equal(result.manifest.upstreamPairs, 7); assert.equal(result.manifest.selectedPairs, 3);
  assert.deepEqual(result.gatewayInput.history, raw.history.slice(-6).map(({ role, content }) => ({ role, content })));
  assert.deepEqual(result.manifest.sources.map(s => s.turnId), [id(14), id(14), id(15), id(15), id(16), id(16), id(4)]);
  assert.throws(() => assembleQaSessionContext(binding, fixture("too many", 8)));
});
test("legacy input/task-history and first-party previews cannot grant new QA context", () => {
  for (const change of [{ kind: "input" }, { kind: "task_input" }, { contextMode: "task_history_v1" }, { contextMode: "current_input_v1" }, { schemaVersion: "qa-context/2" }, { readyForProvider: true }, { contextDigest: "unknown" }, { history: null }, { sourceTurnIds: [] }]) {
    assert.throws(() => assembleQaSessionContext(binding, { ...fixture(), ...change }));
  }
});
test("unknown fields, role injection, duplicates, missing/reordered IDs and malformed omitted ancestors deny", () => {
  const raw = fixture("latest", 7);
  for (const change of [{ history: [...raw.history].reverse() }, { sourceTurnIds: [...raw.sourceTurnIds].reverse() },
    { sourceTurnIds: raw.sourceTurnIds.map((v, i) => i === 2 ? raw.sourceTurnIds[1] : v) },
    ...[{ role: "system" }, { turnId: id(95) }, { content: "" }, { readyForProvider: true }].map(patch => ({ history: raw.history.map((s, i) => i ? s : { ...s, ...patch }) }))]) {
    assert.throws(() => assembleQaSessionContext(binding, { ...raw, ...change }));
  }
});
test("finite message and UTF8 total caps reject whole selected input without truncating corrections", () => {
  assert.throws(() => assembleQaSessionContext(binding, fixture("x".repeat(4001))));
  const raw = fixture("ok"); raw.history[1].content = "x".repeat(8001);
  assert.throws(() => assembleQaSessionContext(binding, raw));
  const multi = fixture("中".repeat(4000)); multi.history[0].content = "中".repeat(4000);
  assert.throws(() => assembleQaSessionContext(binding, multi));
  const huge = fixture("ok", 7); huge.history.forEach((s, i) => { s.content = "中".repeat(i % 2 ? 8000 : 4000); });
  assert.throws(() => assembleQaSessionContext(binding, huge));
});

async function invoke(options: { secondRaw?: unknown; firstRaw?: unknown; leaseOwner?: string;
  authorized?: boolean; transport?: ProtocolTransport; exhausted?: boolean; aborted?: boolean; auditFails?: boolean } = {}) {
  const raw = fixture("纠正一下：广州", 4); let reads = 0, authorizations = 0, physicalCalls = 0, audits = 0;
  const rpc: QaSessionContextRpc = async (name, params) => {
    assert.equal(params.p_turn_id, binding.turnId); assert.equal(params.p_lease_token, id(7));
    if (name === "qa_read_work_v1") return ++reads === 1 ? options.firstRaw ?? raw : options.secondRaw ?? raw;
    assert.equal(name, "qa_authorize_dispatch_v1"); authorizations++;
    assert.equal(params.p_scope_id, id(8)); assert.equal(params.p_policy_id, binding.policyId);
    assert.equal(params.p_context_digest, raw.contextDigest); assert.equal(params.p_provider, "qwen");
    return { kind: options.authorized === false ? "blocked" : "authorized" };
  };
  const guard = budget(1); if (options.exhausted) guard.admitModelStep();
  const controller = new AbortController(); if (options.aborted) controller.abort();
  const result = await invokeQaSessionContext({ contextBinding: binding, scopeId: id(8), rpc,
    recordManifest: async manifest => { audits++; assert.equal(manifest.taskId, binding.taskId); assert.equal(manifest.selectedPairs, 3); if (options.auditFails) throw new Error("fixture audit failure"); } },
    { turnId: binding.turnId, leaseToken: id(7), ownerId: options.leaseOwner ?? binding.actorId },
    { provider: "qwen", endpoint: binding.endpoint, maxOutputTokens: 128, timeoutMs: 30 }, guard,
    async wire => { physicalCalls++; const messages = JSON.parse(wire.body).messages;
      assert.deepEqual(messages, [{ role: "system", content: TEXT_TASK_SYSTEM_PROMPT }, ...raw.history.slice(-6).map(({ role, content }) => ({ role, content })), { role: "user", content: raw.text }]);
      return options.transport ? options.transport(wire) : Response.json(completion("qwen", { role: "assistant", content: '{"outcome":"answered","text":"synthetic"}' })); }, controller.signal);
  return { result, reads, authorizations, physicalCalls, audits };
}
test("real protocol serializer consumes three pairs; fresh QA SQL permission binds original scope and lease attempt", async () => {
  const r = await invoke(); assert.equal(r.result.kind, "protocol_validated"); assert.equal(r.reads, 2);
  assert.equal(r.authorizations, 1); assert.equal(r.physicalCalls, 1); assert.equal(r.audits, 1);
});
test("foreign/expired authenticated actor or mismatching claim owner cannot dispatch", async () => {
  for (const options of [{ firstRaw: { ...fixture(), ownerId: id(90) } }, { secondRaw: { ...fixture(), authSessionId: id(90) } }, { leaseOwner: id(90) }]) {
    const r = await invoke(options); assert.equal(r.result.kind, "unavailable"); assert.equal(r.physicalCalls, 0);
  }
});
test("expired/withdrawn/hidden source SQL refusal, changed text/version and final denial never fall back", async () => {
  const raw = fixture("纠正一下：广州", 4);
  for (const options of [{ firstRaw: { kind: "blocked" } }, { secondRaw: { kind: "blocked" } },
    { secondRaw: { ...raw, text: "changed" } }, { secondRaw: { ...raw, contextDigest: "b".repeat(64) } }, { authorized: false }, { auditFails: true }]) {
    const r = await invoke(options); assert.equal(r.result.kind, "unavailable"); assert.equal(r.physicalCalls, 0);
  }
});
test("existing budget exhaustion and cancellation make zero provider calls; no alternate task is created", async () => {
  const aborted = await invoke({ aborted: true }); assert.equal(aborted.result.kind, "cancelled"); assert.equal(aborted.physicalCalls, 0);
  const exhausted = await invoke({ exhausted: true }); assert.equal(exhausted.result.kind, "unavailable"); assert.equal(exhausted.physicalCalls, 0); assert.equal(exhausted.authorizations, 0);
});
test("provider refusal/timeout retains original protocol outcome and never retries", async () => {
  const refused = await invoke({ transport: async () => new Response(null, { status: 503 }) });
  assert.equal(refused.result.kind, "unavailable"); assert.equal(refused.physicalCalls, 1);
  const timeout = await invoke({ transport: async () => new Promise(() => {}) });
  assert.equal(timeout.result.kind, "unavailable"); if (timeout.result.kind === "unavailable") assert.equal(timeout.result.code, "TIMEOUT_BEFORE_OUTPUT");
  assert.equal(timeout.physicalCalls, 1);
});

test("initial protected read timeout is bounded and late completion cannot authorize or dispatch", async () => {
  let resolveRead: (v: unknown) => void = () => {};
  let calls = 0;
  const result = await invokeQaSessionContext({ contextBinding: binding, scopeId: id(8),
    rpc: async name => { calls++; assert.equal(name, "qa_read_work_v1"); return new Promise(resolve => { resolveRead = resolve; }); } },
  { turnId: binding.turnId, leaseToken: id(7), ownerId: binding.actorId },
  { provider: "qwen", endpoint: binding.endpoint, maxOutputTokens: 128, timeoutMs: 10 }, budget(),
  async () => { calls++; return Response.json(completion("qwen")); }, new AbortController().signal);
  assert.equal(result.kind, "unavailable"); if (result.kind === "unavailable") assert.equal(result.code, "TIMEOUT_BEFORE_OUTPUT");
  resolveRead(fixture()); await new Promise(resolve => setTimeout(resolve, 1)); assert.equal(calls, 1);
});

test("executor adapter derives original binding and invokes only QA read/dispatch with the bounded signal", async () => {
  const calls: string[] = [], raw = fixture(), signal = new AbortController().signal;
  const invokeContext = createQaContextInvoker();
  const result = await invokeContext({
    lease: { turnId: binding.turnId, leaseToken: id(7), ownerId: binding.actorId, attempt: 1, leaseMs: 1000 },
    input: raw, budget: budget(), signal,
    configuration: { scopeId: id(8), priceVersion: "fixture/1", reservedMicros: 100, maxOutputTokens: 128, timeoutMs: 100 },
    binding: { provider: "qwen", endpoint: binding.endpoint, price: () => 1, transport: async () => { throw new Error("wrong transport"); } },
    rpc: async (name, params, scopedSignal) => {
      assert.notEqual(scopedSignal, signal); assert.equal(scopedSignal.aborted, false); calls.push(name);
      if (name === "qa_read_work_v1") return raw;
      assert.equal(name, "qa_authorize_dispatch_v1"); assert.equal(params.p_scope_id, id(8));
      return { kind: "authorized" };
    },
    transport: async () => { calls.push("provider"); return Response.json(completion("qwen", { role: "assistant", content: '{"outcome":"answered","text":"synthetic"}' })); },
  });
  assert.equal(result.kind, "protocol_validated");
  assert.deepEqual(calls, ["qa_read_work_v1", "qa_read_work_v1", "qa_authorize_dispatch_v1", "provider"]);
});
