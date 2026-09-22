import assert from "node:assert/strict";
import test from "node:test";
import { invokeSyntheticVision, type SyntheticVisionRequest } from "../../../lib/server/media/synthetic-vision.ts";
import { PROTOCOL_MODELS, type ProtocolTransport } from "../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { createProviderHttpTransport } from "../../../lib/server/model-gateway/adapters/http-transport.ts";
import { CostGuard } from "../../../lib/server/model-gateway/budget/index.ts";
import { VISION_CASES, scoreVisionTranscript } from "../../../evals/media/vision-cases.ts";

// Protocol fixture header only; real evaluation images are rendered separately.
function request(): SyntheticVisionRequest {
  const png = Buffer.alloc(40);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
  png.writeUInt32BE(13,8); png.write("IHDR",12); png.writeUInt32BE(960,16); png.writeUInt32BE(560,20);
  return { requestId: "test-vision", dataClass: "c0_synthetic", locale: "en", png, timeoutMs: 1000 };
}
function turn() {
  const t = new CostGuard({ windowMs: 60000, perUserAttempts: 4, perTaskAttempts: 4, turnDeadlineMs: 60000, maxModelSteps: 1, maxToolSteps: 1 }).startTurn({ userId: "test", taskId: "vision" });
  assert.equal(t.kind, "turn"); if (t.kind !== "turn") throw new Error("Fixture"); return t;
}
function payload() { return { model: PROTOCOL_MODELS.qwen, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ transcript: "Do NOT board G102." }) } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }; }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const signal = () => new AbortController().signal;

test("real HTTP transport contract accepts the pinned model with inline image and records only metadata", async () => {
  const receipts: unknown[] = [];
  const transport = createProviderHttpTransport({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "00000000-0000-4000-8000-000000000001", configurationVersion: 1, timeoutMs: 1000 }, {
    credential: () => "fixture-secret", recordDestination: async receipt => { receipts.push(receipt); },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, PROTOCOL_MODELS.qwen); assert.equal(body.enable_thinking, false);
      assert.match(body.messages[1].content[0].image_url.url, /^data:image\/png;base64,/);
      assert.equal(init?.redirect, "manual"); return response(payload());
    },
  });
  const result = await invokeSyntheticVision(request(), turn(), transport, signal());
  assert.equal(result.kind, "candidate");
  assert.equal(result.receipt?.usage?.totalTokens, 30);
  assert.equal(result.receipt?.usage?.cachedInputTokens, null);
  assert.equal(result.receipt?.userCapability, "disabled");
  assert.equal(result.receipt?.providerDeletion, "not_verified");
  assert.equal(receipts.length, 3);
  assert.doesNotMatch(JSON.stringify(receipts), /fixture-secret|base64|Do NOT/);
});

test("blocked classes, URLs, oversized and invalid image headers never dispatch", async () => {
  let calls = 0; const transport: ProtocolTransport = async () => { calls++; return response(payload()); };
  const oversizedDimensions = request(); Buffer.from(oversizedDimensions.png.buffer).writeUInt32BE(9999,16);
  const invalid: unknown[] = [null, {...request(), dataClass: "c2_sensitive"}, {...request(), url: "https://private/image"}, {...request(), png: new Uint8Array(131073)}, {...request(), png: new Uint8Array(40)}, oversizedDimensions, {...request(), timeoutMs: Infinity}];
  for (const input of invalid) assert.equal((await invokeSyntheticVision(input as SyntheticVisionRequest, turn(), transport, signal())).kind, "unavailable");
  assert.equal(calls, 0);
});

test("budget, pre-cancel and repeated turn admission stop before transport", async () => {
  let calls = 0; const transport: ProtocolTransport = async () => { calls++; return response(payload()); };
  const budget = turn(); const stopped = new AbortController(); stopped.abort();
  assert.equal((await invokeSyntheticVision(request(), budget, transport, stopped.signal)).kind, "unavailable");
  await invokeSyntheticVision(request(), budget, transport, signal());
  const denied = await invokeSyntheticVision(request(), budget, transport, signal());
  assert.equal(denied.kind === "unavailable" && denied.code, "BUDGET_EXHAUSTED"); assert.equal(calls, 1);
});

test("invalid/partial/safety output preserves valid metering but never yields a transcript", async () => {
  for (const mode of ["length", "content_filter", "malformed", "extra", "wrong-model", "tools"]) {
    const value = payload();
    if (mode === "length" || mode === "content_filter") value.choices[0].finish_reason = mode;
    if (mode === "malformed") value.choices[0].message.content = "secret raw invalid body";
    if (mode === "extra") value.choices[0].message.content = '{"transcript":"x","execute":"tool"}';
    if (mode === "wrong-model") value.model = "unqualified";
    if (mode === "tools") Object.assign(value.choices[0].message, { tool_calls: [{ name: "execute" }] });
    const result = await invokeSyntheticVision(request(), turn(), async () => response(value), signal());
    assert.equal(result.kind, "unavailable"); assert.equal(result.receipt?.usage?.totalTokens, 30);
    assert.doesNotMatch(JSON.stringify(result), /secret raw|execute|transcript/);
  }
});

test("missing or inconsistent token counts do not become zero cost", async () => {
  for (const usage of [undefined, {prompt_tokens: 1,completion_tokens: 2,total_tokens: 9}, {prompt_tokens: 20,completion_tokens: 10,total_tokens: 30,prompt_tokens_details: {cached_tokens: 21}}]) {
    const result = await invokeSyntheticVision(request(), turn(), async () => response({...payload(), usage}), signal());
    assert.equal(result.kind, "unavailable"); assert.equal(result.receipt?.usage, null); assert.equal(result.receipt?.cost, "unknown");
  }
});

test("cancellation and timeout return promptly even when transport ignores abort", async () => {
  for (const mode of ["cancel", "timeout"]) {
    const controller = new AbortController(); let resolve!: (r: Response) => void; let transportSignal!: AbortSignal;
    const pending = invokeSyntheticVision({...request(), timeoutMs: mode === "timeout" ? 10 : 1000}, turn(), async req => { transportSignal = req.signal; return new Promise(r => { resolve = r; }); }, controller.signal);
    if (mode === "cancel") controller.abort();
    const result = await pending;
    assert.equal(result.kind === "unavailable" && result.code, mode === "cancel" ? "CANCELLED" : "TIMEOUT_BEFORE_OUTPUT");
    assert.equal(transportSignal.aborted, true); assert.equal(result.receipt?.dispatched, true);
    assert.equal(result.receipt?.usage, null); resolve(response(payload()));
  }
});

test("stream cancellation and oversized response discard content", async () => {
  let cancelled = false; const controller = new AbortController();
  const pending = invokeSyntheticVision(request(), turn(), async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } }), { headers: {"content-type":"application/json"} }), controller.signal);
  await new Promise(r => setTimeout(r, 5)); controller.abort(); await pending; assert.equal(cancelled, true);
  const result = await invokeSyntheticVision(request(), turn(), async () => response({content:"x".repeat(262145)}), signal());
  assert.equal(result.kind, "unavailable");
});

test("frozen bilingual evaluator rejects changed negations, names, dates, digits and hallucinated lines", () => {
  for (const fixture of VISION_CASES) {
    const transcript = fixture.lines.join("\n"); assert.equal(scoreVisionTranscript(fixture.id, transcript).pass, true);
    for (const altered of [transcript.replace("G120", "G102"), transcript.replace("2026-10-08", "2026-10-09"), transcript.replace("128.50", "128.60"), transcript.replace(fixture.fields[0], "Other"), transcript.replace(fixture.fields[5], "Allowed"), transcript + "\nextra"]) assert.equal(scoreVisionTranscript(fixture.id, altered).pass, false);
  }
});
