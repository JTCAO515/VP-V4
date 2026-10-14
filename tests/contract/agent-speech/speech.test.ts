import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { invokeSyntheticSpeech, SPEECH_ENDPOINTS, SPEECH_MODELS, type SpeechRequest, type SpeechTransport } from "../../../lib/server/media/speech/index.ts";
import { inspectWav } from "../../../lib/server/media/speech/wav.ts";
import { CostGuard } from "../../../lib/server/model-gateway/budget/index.ts";

function wav(seconds = 0.1, rate = 16000): Buffer {
  const n = Math.round(seconds * rate) * 2, b = Buffer.alloc(44 + n);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n, 40);
  b.writeInt16LE(200, 44); return b;
}
function turn(max = 1) {
  const guard = new CostGuard({ windowMs: 60000, perUserAttempts: 4, perTaskAttempts: 4, turnDeadlineMs: 60000, maxModelSteps: max, maxToolSteps: 1 });
  const result = guard.startTurn({ userId: "synthetic", taskId: "speech" });
  assert.equal(result.kind, "turn"); if (result.kind !== "turn") throw Error("Fixture"); return result;
}
const signal = () => new AbortController().signal;
const asr = (locale: "zh" | "en" = "en"): SpeechRequest => ({ requestId: "speech-test", dataClass: "c0_synthetic", locale, timeoutMs: 1000, task: "asr", wav: wav() });
const tts = (locale: "zh" | "en" = "en", text = "Do NOT board G102 on 2026-10-14, Alice."): SpeechRequest => ({ requestId: "speech-test", dataClass: "c0_synthetic", locale, timeoutMs: 1000, task: "tts", text });
const payload = (locale = "en") => ({ task: "transcribe", language: locale === "zh" ? "chinese" : "english", duration: 0.1,
  text: locale === "zh" ? "张三不要乘坐G102，日期2026-10-14，金额102元。" : "Alice must NOT board G102 on 2026-10-14. Amount 102.", usage: { type: "duration", seconds: 0.1 } });
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
const audioResponse = (b = wav(0.1, 24000)) => new Response(Uint8Array.from(b), { headers: { "content-type": "audio/wav" } });

for (const locale of ["zh", "en"] as const) {
  test(`${locale} ASR invokes multipart producer, preserves names/numbers/negation/date, records duration`, async () => {
    const request = asr(locale);
    const result = await invokeSyntheticSpeech(request, turn(), async req => {
      assert.equal(req.endpoint, SPEECH_ENDPOINTS.asr); assert.equal(req.method, "POST");
      assert(req.body instanceof FormData); assert.equal(req.body.get("model"), SPEECH_MODELS.asr);
      assert.equal(req.body.get("language"), locale); assert.equal(req.body.get("response_format"), "verbose_json");
      assert.equal(req.body.get("prompt"), null);
      const file = req.body.get("file"); assert(file instanceof File); assert.equal(file.name, "synthetic.wav");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), request.task === "asr" ? request.wav : null);
      return json(payload(locale));
    }, signal());
    assert.equal(result.kind, "candidate"); if (result.kind !== "candidate" || result.task !== "asr") throw Error("Expected transcript");
    assert.equal(result.transcript, payload(locale).text); assert.equal(result.receipt.inputSeconds, 0.1);
    assert.deepEqual(result.receipt.usage, { type: "duration", seconds: 0.1 });
    assert.equal(result.receipt.userCapability, "disabled"); assert.equal(result.receipt.cost, "unknown");
    assert(!JSON.stringify(result.receipt).includes(result.transcript));
  });
  test(`${locale} TTS preserves exact read-aloud input and returns caller-owned validated WAV`, async () => {
    const text = locale === "zh" ? "李四不要支付102元。地址南京路8号，日期2026-10-14。\n字幕第二行。" : "Alice must NOT pay 102. Address 8 Nanjing Road, date 2026-10-14.\nSubtitle line 2.";
    const result = await invokeSyntheticSpeech(tts(locale, text), turn(), async req => {
      assert.equal(req.endpoint, SPEECH_ENDPOINTS.tts); assert.equal(typeof req.body, "string");
      assert.deepEqual(JSON.parse(String(req.body)), { model: "tts-1", input: text, voice: "alloy", response_format: "wav", speed: 1 });
      return audioResponse();
    }, signal());
    assert.equal(result.kind, "candidate"); if (result.kind !== "candidate" || result.task !== "tts") throw Error("Expected audio");
    assert.deepEqual(result.wav, Uint8Array.from(wav(0.1, 24000))); assert.equal(result.receipt.outputSeconds, 0.1);
    assert.equal(result.receipt.inputCharacters, [...text].length); assert.equal(result.receipt.usage, null);
    assert.equal(result.receipt.localPersistence, "none"); assert.equal(result.receipt.providerRetention, "unknown");
    assert.equal(result.receipt.providerDeletion, "not_verified"); assert(result.receipt.firstResponseByteMs! >= 0);
  });
}

test("C2/fake eligibility/URLs/unsupported locales/oversized/malformed/silent input never dispatch", async () => {
  let calls = 0;
  const transport: SpeechTransport = async () => { calls++; return json(payload()); };
  const silent = wav(); silent.fill(0, 44);
  const wrongRate = wav(); wrongRate.writeUInt32LE(48000, 24);
  const invalid: unknown[] = [null, { ...asr(), dataClass: "c2_sensitive", eligible: true }, { ...asr(), eligibility: true },
    { ...asr(), wav: "https://example.test/private.wav" }, { ...tts(), text: " " }, { ...tts(), text: "x".repeat(2001) },
    { ...tts(), text: "\ud800" }, { ...tts(), text: "secret\u0000" }, { ...asr(), locale: "ar" }, { ...asr(), timeoutMs: Infinity },
    { ...asr(), timeoutMs: 0 }, { ...asr(), task: "translate" }, { ...asr(), wav: wav().subarray(0, 50) },
    { ...asr(), wav: silent }, { ...asr(), wav: wrongRate }, { ...asr(), wav: wav(60.1) }, { ...asr(), requestId: "bad id" }];
  for (const request of invalid) { const result = await invokeSyntheticSpeech(request as SpeechRequest, turn(), transport, signal()); assert.equal(result.kind, "unavailable"); }
  assert.equal(calls, 0);
});

test("WAV rejects duplicate data, bad sizes/rate/encoding, missing data and subrange garbage", () => {
  assert.equal(inspectWav(wav())?.seconds, 0.1);
  const extra = Buffer.concat([wav(), Buffer.from("data\0\0\0\0")]); extra.writeUInt32LE(extra.length - 8, 4);
  const invalid = [extra, wav().subarray(0, 43), wav(0.01)];
  for (const [offset, value] of [[4, 999], [16, 18], [20, 3], [22, 2], [28, 9], [32, 4], [34, 8], [40, 3]]) {
    const b = wav(); b.writeUInt16LE(value, offset); invalid.push(b);
  }
  for (const b of invalid) assert.equal(inspectWav(b), null);
});

test("caller mutation after dispatch cannot change admitted audio or digest", async () => {
  const input = wav(), before = Buffer.from(input), request = { ...asr(), wav: input } as SpeechRequest;
  const result = await invokeSyntheticSpeech(request, turn(), async req => {
    input.fill(0); assert(req.body instanceof FormData); const file = req.body.get("file"); assert(file instanceof File);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), before); return json(payload());
  }, signal());
  assert.equal(result.receipt?.inputSha256, createHash("sha256").update(before).digest("hex")); assert.equal(result.kind, "candidate");
});

test("missing usage remains unknown; malformed/nonfinite/inconsistent usage and output reject", async () => {
  const missing = payload(); delete (missing as { usage?: unknown }).usage;
  const good = await invokeSyntheticSpeech(asr(), turn(), async () => json(missing), signal()); assert.equal(good.kind, "candidate"); assert.equal(good.receipt?.usage, null);
  for (const usage of [null, {}, { type: "duration", seconds: -1 }, { type: "duration", seconds: Infinity }, { type: "duration", seconds: 61 },
    { type: "duration", seconds: "0.1" }, { type: "duration", seconds: 0.1, cost: 0 }, { type: "tokens", input_tokens: 1, output_tokens: 2, total_tokens: 0 }]) {
    const result = await invokeSyntheticSpeech(asr(), turn(), async () => json({ ...payload(), usage }), signal());
    assert.equal(result.kind, "unavailable"); if (result.kind === "unavailable") assert.equal(result.code, "MODEL_OUTPUT_INVALID");
  }
  for (const changed of [{ text: "" }, { text: "x".repeat(8001) }, { text: "\ud800" }, { language: "chinese" }, { duration: 60 }, { duration: null }, { error: "failed" }, { task: "translate" }]) {
    const result = await invokeSyntheticSpeech(asr(), turn(), async () => json({ ...payload(), ...changed }), signal()); assert.equal(result.kind, "unavailable");
  }
});

test("status/redirect/MIME/error and transport exceptions cannot become candidates", async () => {
  for (const response of [new Response("{}", { status: 429 }), new Response("{}", { status: 302 }), new Response("{}", { headers: { "content-type": "text/plain" } }),
    new Response("{", { headers: { "content-type": "application/json" } }), new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } })]) {
    assert.equal((await invokeSyntheticSpeech(asr(), turn(), async () => response, signal())).kind, "unavailable");
  }
  const result = await invokeSyntheticSpeech(asr(), turn(), async () => { throw Error("provider secret"); }, signal());
  assert.equal(result.kind, "unavailable"); if (result.kind === "unavailable") assert.equal(result.code, "PROVIDER_UNAVAILABLE");
  assert(!JSON.stringify(result).includes("provider secret"));
});

test("explicit partial/refusal and malformed/overlapping/truncated segments reject; usage survives invalid output", async () => {
  const valid = { ...payload(), segments: [{ start: 0, end: 0.1, text: payload().text }] };
  assert.equal((await invokeSyntheticSpeech(asr(), turn(), async () => json(valid), signal())).kind, "candidate");
  for (const changed of [{ partial: true }, { refusal: "blocked" }, { finish_reason: "length" }, { segments: [] }, { segments: null },
    { segments: [{ start: 0, end: 0.1, text: "Only part" }] }, { segments: [{ start: -1, end: 0.1, text: payload().text }] },
    { segments: [{ start: 0, end: 0.1, text: "Alice" }, { start: 0.05, end: 0.1, text: " NOT" }] },
    { segments: [{ start: 0, end: 1, text: payload().text }] }]) {
    const result = await invokeSyntheticSpeech(asr(), turn(), async () => json({ ...payload(), ...changed }), signal());
    assert.equal(result.kind, "unavailable"); assert.deepEqual(result.receipt?.usage, { type: "duration", seconds: 0.1 });
  }
});

test("TTS silence/truncation/non-WAV/oversize/duration limit rejected; byte limit cancels reader", async () => {
  const silent = wav(); silent.fill(0, 44);
  for (const bytes of [silent, wav().subarray(0, 100), Buffer.from("not wav"), wav(60.1)]) {
    assert.equal((await invokeSyntheticSpeech(tts(), turn(), async () => audioResponse(bytes), signal())).kind, "unavailable");
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; } });
  const result = await invokeSyntheticSpeech(asr(), turn(), async () => new Response(stream, { headers: { "content-type": "application/json" } }), signal());
  assert.equal(result.kind, "unavailable"); assert.equal(cancelled, true);
});

test("shared CostGuard denies second dispatch; preabort denies the first", async () => {
  let calls = 0; const transport: SpeechTransport = async () => { calls++; return json(payload()); }; const budget = turn();
  await invokeSyntheticSpeech(asr(), budget, transport, signal()); const result = await invokeSyntheticSpeech(asr(), budget, transport, signal());
  assert.equal(result.kind, "unavailable"); if (result.kind === "unavailable") assert.equal(result.code, "BUDGET_EXHAUSTED"); assert.equal(calls, 1);
  const c = new AbortController(); c.abort(); const stopped = await invokeSyntheticSpeech(asr(), turn(), transport, c.signal);
  assert.equal(stopped.kind, "unavailable"); assert.equal(stopped.receipt?.dispatched, false); assert.equal(calls, 1);
});

for (const task of ["asr", "tts"] as const) {
  test(`${task} cancellation/timeout returns promptly, aborts transport, discards and cleans late response`, async () => {
    for (const timeout of [false, true]) {
      let finish!: (response: Response) => void, captured!: AbortSignal;
      const c = new AbortController();
      const promise = invokeSyntheticSpeech({ ...(task === "asr" ? asr() : tts()), timeoutMs: timeout ? 10 : 1000 }, turn(), req => {
        captured = req.signal; return new Promise(resolve => { finish = resolve; });
      }, c.signal);
      if (!timeout) c.abort();
      const result = await promise; assert.equal(result.kind, "unavailable");
      if (result.kind === "unavailable") assert.equal(result.code, timeout ? "TIMEOUT_BEFORE_OUTPUT" : "CANCELLED");
      assert.equal(captured.aborted, true); assert.equal(result.receipt?.usage, null);
      let cleaned = false;
      finish(new Response(new ReadableStream({ cancel() { cleaned = true; } })));
      await new Promise(resolve => setImmediate(resolve)); assert.equal(cleaned, true);
    }
  });
}

test("cancellation interrupts stalled body consumption and cancels stream", async () => {
  let cancelled = false, entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
  const c = new AbortController();
  const resultPromise = invokeSyntheticSpeech(asr(), turn(), async () => {
    entered(); return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
  }, c.signal);
  await ready; await new Promise(resolve => setImmediate(resolve)); c.abort();
  const result = await resultPromise; assert.equal(result.kind, "unavailable"); assert.equal(cancelled, true);
});
