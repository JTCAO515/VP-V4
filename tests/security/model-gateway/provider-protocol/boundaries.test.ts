import assert from "node:assert/strict";
import test from "node:test";
import { invokeProviderProtocol, type ProtocolRequest } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { budget, completion, request } from "../../../contract/model-gateway/provider-protocol/fixtures.ts";

const signal = () => new AbortController().signal;
test("policy rejection, pre-cancellation and exhausted C0 budget never dispatch", async () => {
  let calls = 0;
  const transport = async () => { calls++; return Response.json(completion("qwen")); };
  const turn = budget(1);
  for (const dataClass of ["c1_user", "c2_sensitive", "c3_restricted", "c4_secret"] as const) {
    const privateData = await invokeProviderProtocol(request("qwen", { dataClass }), turn, transport, signal());
    assert.equal(privateData.kind === "unavailable" && privateData.code, "DATA_POLICY_BLOCKED");
  }
  const controller = new AbortController(); controller.abort();
  assert.equal((await invokeProviderProtocol(request("qwen"), turn, transport, controller.signal)).kind, "cancelled");
  assert.equal(calls, 0);
  assert.equal((await invokeProviderProtocol(request("qwen"), turn, transport, signal())).kind, "protocol_validated");
  const denied = await invokeProviderProtocol(request("qwen"), turn, transport, signal());
  assert.equal(denied.kind === "unavailable" && denied.code, "BUDGET_EXHAUSTED");
  assert.equal(calls, 1);
});

test("invalid runtime requests reject before transport", async () => {
  let calls = 0;
  for (const patch of [{ requestId: undefined }, { provider: "unknown" }, { timeoutMs: Infinity }, { maxOutputTokens: 0 }, { input: "" }, { task: "streaming" }, { dataClass: "invalid" }, { task: "tool_candidate" }]) {
    const result = await invokeProviderProtocol({ ...request("qwen"), ...patch } as ProtocolRequest, budget(), async () => { calls++; return Response.json({}); }, signal());
    assert.equal(result.kind === "unavailable" && result.code, "INVALID_INPUT");
  }
  assert.equal(calls, 0);
});

test("HTTP failures and exceptions reveal no headers/body/secret and never retry or fallback", async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    let calls = 0;
    const result = await invokeProviderProtocol(request("glm"), budget(), async () => { calls++; return new Response("synthetic-secret-body", { status, headers: { "x-secret": "synthetic-secret-header" } }); }, signal());
    assert.equal(calls, 1);
    assert.equal(result.kind === "unavailable" && result.code, "PROVIDER_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
    assert.equal(result.usage, null);
  }
  const failure = await invokeProviderProtocol(request("glm"), budget(), async () => { throw new Error("synthetic-secret-exception"); }, signal());
  assert.doesNotMatch(JSON.stringify(failure), /synthetic-secret/);
  assert.equal(failure.kind === "unavailable" && failure.code, "PROVIDER_UNAVAILABLE");
});

test("timeout aborts one ignored transport and cancels its late response", async () => {
  let sentSignal: AbortSignal | undefined;
  let finish: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  const result = await invokeProviderProtocol(request("deepseek", { timeoutMs: 5 }), budget(), async (wire) => { sentSignal = wire.signal; return pending; }, signal());
  assert.equal(result.kind === "unavailable" && result.code, "TIMEOUT_BEFORE_OUTPUT");
  assert.equal(sentSignal?.aborted, true);
  assert.equal(result.usage, null);
  const discarded = new Promise<void>((resolve) => {
    finish(new Response(new ReadableStream({ cancel() { resolve(); } })));
  });
  await discarded;
});

test("caller cancellation aborts HTTP and remains cancelled even if transport ignores it", async () => {
  const controller = new AbortController();
  let sentSignal: AbortSignal | undefined;
  const result = await invokeProviderProtocol(request("deepseek"), budget(), async (wire) => { sentSignal = wire.signal; controller.abort(); return new Promise<Response>(() => {}); }, controller.signal);
  assert.equal(result.kind, "cancelled");
  assert.equal(sentSignal?.aborted, true);
});

test("body reads share the deadline and cancel hanging streams", async () => {
  let cancelledBody = false;
  const result = await invokeProviderProtocol(request("qwen", { timeoutMs: 5 }), budget(), async () => new Response(new ReadableStream({ cancel() { cancelledBody = true; } }), { headers: { "content-type": "application/json" } }), signal());
  assert.equal(result.kind === "unavailable" && result.code, "TIMEOUT_BEFORE_OUTPUT");
  assert.equal(cancelledBody, true);
});

test("oversized, malformed and streaming bodies reject without returning raw payload", async () => {
  const samples = [new Response(new Uint8Array([34, 255, 34]), { headers: { "content-type": "application/json" } }), new Response("synthetic-secret-invalid-json", { headers: { "content-type": "application/json" } }), new Response("data: synthetic-secret", { headers: { "content-type": "text/event-stream" } }), new Response('"' + "x".repeat(262144) + '"', { headers: { "content-type": "application/json" } })];
  for (const response of samples) {
    const result = await invokeProviderProtocol(request("qwen"), budget(), async () => response, signal());
    assert.equal(result.kind === "unavailable" && result.code, "MODEL_OUTPUT_INVALID");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-secret/);
  }
});

test("a caller boolean callback cannot open the C0 entry to C2", async () => {
  let calls = 0;
  const result = await Reflect.apply(invokeProviderProtocol, undefined, [
    request("qwen", { dataClass: "c2_sensitive", task: "text_turn_v1" }), budget(),
    async () => { calls++; return Response.json(completion("qwen")); }, signal(), async () => true,
  ]);
  assert.equal(result.kind === "unavailable" && result.code, "DATA_POLICY_BLOCKED");
  assert.equal(calls, 0);
});
