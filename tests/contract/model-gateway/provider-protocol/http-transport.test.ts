import test from "node:test";
import assert from "node:assert/strict";
import { createProviderHttpTransport, type DestinationReceipt, type HttpProviderConfiguration } from "../../../../lib/server/model-gateway/adapters/http-transport.ts";
import { invokeProviderProtocol, invokeTextProviderProtocol, PROTOCOL_MODELS } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { budget, completion, request } from "./fixtures.ts";
const signal = () => new AbortController().signal;
const config: HttpProviderConfiguration = { provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", configurationId: "10000000-0000-4000-8000-000000000001", configurationVersion: 1, timeoutMs: 1000 };
const wire = (provider = config.provider) => ({ provider, method: "POST" as const, body: JSON.stringify({ model: PROTOCOL_MODELS[provider] }), signal: signal() });
const fail = (error: unknown) => error instanceof Error && error.message === "Provider transport unavailable." && !JSON.stringify(error).includes("SECRET_CANARY");

test("explicit HTTP bindings preserve all three protocol dialects and closed destination evidence", async () => {
  for (const [provider, endpoint] of [["qwen", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"], ["glm", "https://open.bigmodel.cn/api/paas/v4/chat/completions"], ["deepseek", config.endpoint]] as const) {
    const receipts: DestinationReceipt[] = [];
    let calls = 0;
    const transport = createProviderHttpTransport({ ...config, provider, endpoint }, {
      credential: () => "SECRET_CANARY_KEY",
      recordDestination: async receipt => { receipts.push(receipt); },
      fetch: async (url, init) => {
        calls++; assert.equal(url, endpoint); assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
        assert.deepEqual(init?.headers, { "content-type": "application/json", authorization: "Bearer SECRET_CANARY_KEY" });
        assert.equal(JSON.parse(String(init?.body)).model, PROTOCOL_MODELS[provider]);
        return Response.json(completion(provider), { headers: { "x-secret": "SECRET_CANARY_HEADER" } });
      },
    });
    const result = await invokeProviderProtocol(request(provider), budget(), transport, signal());
    assert.equal(result.kind, "protocol_validated"); assert.equal(calls, 1);
    assert.deepEqual(receipts.map(r => r.phase), ["configured", "attempted", "response_buffered"]);
    assert.equal(new Set(receipts.map(r => r.invocationId)).size, 1);
    for (const receipt of receipts) {
      assert.equal(Object.isFrozen(receipt), true); assert.equal(receipt.endpoint, endpoint); assert.equal(receipt.model, PROTOCOL_MODELS[provider]);
      assert.deepEqual(Object.keys(receipt).sort(), ["configurationId", "configurationVersion", "endpoint", "invocationId", "model", "observedAt", "phase", "provider", "schemaVersion"]);
      assert.doesNotMatch(JSON.stringify(receipt), /SECRET_CANARY|Synthetic answer|usage|billing/);
    }
  }
});

test("provider, exact endpoint and model mismatches fail before credentials or HTTP", async () => {
  for (const endpoint of ["http://api.deepseek.com/chat/completions", "https://api.deepseek.com/chat/completions?key=SECRET_CANARY", "https://api.deepseek.com/chat/completions#x", "https://api.deepseek.com.evil.invalid/chat/completions", "https://user@api.deepseek.com/chat/completions", "https://api.deepseek.com:443/chat/completions", "http://127.0.0.1:1234/", "https://open.bigmodel.cn/api/paas/v4/chat/completions"]) {
    assert.throws(() => createProviderHttpTransport({ ...config, endpoint }, { credential: () => "key", recordDestination: async () => {} }), /configuration unavailable/);
  }
  let credentials = 0, calls = 0;
  const transport = createProviderHttpTransport(config, { credential: () => { credentials++; return "key"; }, recordDestination: async () => {}, fetch: async () => { calls++; return Response.json({}); } });
  await assert.rejects(transport(wire("qwen")), fail);
  await assert.rejects(transport({ ...wire(), endpoint: "https://api.deepseek.com/v1/chat/completions" }), fail);
  await assert.rejects(transport({ ...wire(), body: JSON.stringify({ model: "another-model" }) }), fail);
  assert.equal(credentials, 0); assert.equal(calls, 0);
});

test("existing C0 policy/budget and C2 policy-endpoint authority remain ahead of HTTP", async () => {
  let calls = 0;
  const transport = createProviderHttpTransport(config, { credential: () => "key", recordDestination: async () => {}, fetch: async () => { calls++; return Response.json(completion("deepseek")); } });
  const turn = budget(1);
  assert.equal((await invokeProviderProtocol(request("deepseek", { dataClass: "c2_sensitive" }), turn, transport, signal())).kind, "unavailable");
  await invokeProviderProtocol(request("deepseek"), turn, transport, signal());
  assert.equal((await invokeProviderProtocol(request("deepseek"), turn, transport, signal())).kind, "unavailable");
  assert.equal(calls, 1);
  const lease = { turnId: "synthetic-turn", leaseToken: "synthetic-lease" };
  const endpoint = "https://api.deepseek.com/v1/chat/completions";
  const rpc = async (name: string) => name === "read_text_work" ? { kind: "input", provider: "deepseek", endpoint, policyId: "synthetic-policy", text: "Synthetic" } : { kind: "authorized" };
  const result = await invokeTextProviderProtocol(lease, { provider: "deepseek", endpoint, maxOutputTokens: 10, timeoutMs: 1000 }, rpc, budget(), transport, signal());
  assert.equal(result.kind, "unavailable"); assert.equal(calls, 1, "approved endpoint cannot silently use another transport endpoint");
  for (const authorized of [false, true]) {
    const matchingRpc = async (name: string) => name === "read_text_work" ? { kind: "input", provider: "deepseek", endpoint: config.endpoint, policyId: "synthetic-policy", text: "Synthetic" } : { kind: authorized ? "authorized" : "denied" };
    const matched = await invokeTextProviderProtocol(lease, { provider: "deepseek", endpoint: config.endpoint, maxOutputTokens: 10, timeoutMs: 1000 }, matchingRpc, budget(), transport, signal());
    assert.equal(matched.kind, authorized ? "protocol_validated" : "unavailable");
    assert.equal(calls, authorized ? 2 : 1);
  }
});

test("credential and receipt exceptions are redacted; unavailable preparation sends nothing", async () => {
  let calls = 0;
  for (const credential of [() => null, () => "bad\r\nSECRET_CANARY", () => { throw Error("SECRET_CANARY"); }]) {
    const transport = createProviderHttpTransport(config, { credential, recordDestination: async () => {}, fetch: async () => { calls++; return Response.json({}); } });
    await assert.rejects(transport(wire()), fail);
  }
  const transport = createProviderHttpTransport(config, { credential: () => "key", recordDestination: async () => { throw Error("SECRET_CANARY"); }, fetch: async () => { calls++; return Response.json({}); } });
  await assert.rejects(transport(wire()), fail); assert.equal(calls, 0);
});

test("ignored credential or configured-sink cancellation never causes late HTTP", async () => {
  for (const stage of ["credential", "sink"]) {
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const transport = createProviderHttpTransport({ ...config, timeoutMs: 5 }, {
      credential: async () => { if (stage === "credential") await held; return "key"; },
      recordDestination: async () => { if (stage === "sink") await held; },
      fetch: async () => { calls++; return Response.json({}); },
    });
    await assert.rejects(transport(wire()), fail);
    release(); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 0);
  }
});

test("failed post-dispatch sink cancels HTTP and does not emit successful destination evidence", async () => {
  let responseCancelled = false, called = 0;
  const phases: string[] = [];
  const transport = createProviderHttpTransport(config, {
    credential: () => "key",
    recordDestination: async receipt => { phases.push(receipt.phase); if (receipt.phase === "attempted") throw Error("SECRET_CANARY"); },
    fetch: async () => { called++; return new Response(new ReadableStream({ cancel() { responseCancelled = true; } }), { headers: { "content-type": "application/json" } }); },
  });
  await assert.rejects(transport(wire()), fail);
  assert.equal(called, 1); assert.equal(responseCancelled, true); assert.deepEqual(phases, ["configured", "attempted"]);
});

test("bounded transport strips error details, redirects, raw headers and oversized streams", async () => {
  for (const response of [Response.json({ error: "SECRET_CANARY" }, { status: 401 }), new Response("SECRET_CANARY", { status: 307, headers: { location: "https://evil.invalid" } }), new Response("SECRET_CANARY", { headers: { "content-type": "text/event-stream" } }), new Response("x".repeat(262145), { headers: { "content-type": "application/json" } })]) {
    const transport = createProviderHttpTransport(config, { credential: () => "key", recordDestination: async () => {}, fetch: async () => response });
    await assert.rejects(transport(wire()), fail);
  }
  const transport = createProviderHttpTransport(config, { credential: () => "key", recordDestination: async () => {}, fetch: async () => { throw Error("SECRET_CANARY_NETWORK"); } });
  await assert.rejects(transport(wire()), fail);
});

test("late ignored fetch responses are cancelled after the factory deadline", async () => {
  let finish: (response: Response) => void = () => {};
  let cancelled = false;
  const phases: string[] = [];
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const transport = createProviderHttpTransport({ ...config, timeoutMs: 5 }, { credential: () => "key", recordDestination: async receipt => { phases.push(receipt.phase); }, fetch: async () => response });
  await assert.rejects(transport(wire()), fail);
  finish(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true); assert.deepEqual(phases, ["configured", "attempted"]);
});

test("post-response receipt failure leaves existing durable budget accounting unknown", async () => {
  const { runWithDurableBudget } = await import("../../../../lib/server/model-gateway/budget/durable.ts");
  const actions: Readonly<Record<string, string | number | null>>[] = [];
  let calls = 0;
  const transport = createProviderHttpTransport(config, {
    credential: () => "key",
    recordDestination: async receipt => { if (receipt.phase === "response_buffered") throw Error("SECRET_CANARY"); },
    fetch: async () => { calls++; return Response.json(completion("deepseek")); },
  });
  const attempt = { scopeId: config.configurationId, ownerId: "20000000-0000-4000-8000-000000000002", taskId: "30000000-0000-4000-8000-000000000003", attemptId: "40000000-0000-4000-8000-000000000004", provider: config.provider, model: PROTOCOL_MODELS.deepseek, priceVersion: "synthetic-v1", reservedMicros: 100, timeoutMs: 1000 };
  const result = await runWithDurableBudget(attempt, async (name, parameters) => {
    if (name === "reserve_model_budget") return { kind: "reserved" };
    if (name === "dispatch_model_budget") return { kind: "dispatched" };
    actions.push(parameters); return { kind: "pending" };
  }, async signal => {
    const value = await invokeProviderProtocol(request("deepseek"), budget(), transport, signal);
    assert.equal(value.kind, "unavailable"); assert.equal(value.usage, null);
    return { value, actualMicros: null };
  }, signal());
  assert.equal(result.kind === "completed" && result.accounting, "pending"); assert.equal(calls, 1);
  assert.equal(actions.length, 1); assert.equal(actions[0].p_action, "pending"); assert.equal(actions[0].p_actual_micros, null);
});
